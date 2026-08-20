"""
Manim EZ — FastAPI Backend
Accepts a scene JSON payload, generates a Manim Python script,
runs the manim CLI, and returns the rendered MP4.
"""

import os
import uuid
import json
import shutil
import subprocess
import textwrap
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Manim EZ", version="1.0.0")

# Allow the frontend (served on any port) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory where render outputs are saved
RENDERS_DIR = Path("renders")
RENDERS_DIR.mkdir(exist_ok=True)

# Serve rendered videos as static files
app.mount("/renders", StaticFiles(directory="renders"), name="renders")

# Serve the frontend
app.mount("/static", StaticFiles(directory="."), name="static")


# ─── Pydantic Models ────────────────────────────────────────────────────────

class ManimObject(BaseModel):
    id: str
    type: str                           # Circle, Square, Triangle, Line, Text, MathTex
    color: str = "#FFFFFF"
    position: List[float] = [0.0, 0.0]
    # Shape-specific
    radius: Optional[float] = None      # Circle
    side_length: Optional[float] = None # Square
    width: Optional[float] = None       # Rectangle / Line
    height: Optional[float] = None      # Rectangle
    text: Optional[str] = None          # Text / MathTex
    font_size: Optional[int] = None     # Text
    stroke_color: Optional[str] = None
    fill_opacity: Optional[float] = None
    stroke_width: Optional[float] = None
    scale: Optional[float] = None


class AnimationStep(BaseModel):
    obj_id: str
    type: str           # FadeIn, FadeOut, GrowFromCenter, Write, Rotate, etc.
    duration: float = 1.0
    start_time: float = 0.0
    target_id: Optional[str] = None     # for Transform
    angle: Optional[float] = None       # for Rotate (degrees)
    scale_factor: Optional[float] = None


class ScenePayload(BaseModel):
    objects: List[ManimObject]
    animations: List[AnimationStep]
    background_color: str = "#1C1C2E"
    quality: str = "low"                # low | medium | high


# ─── Code Generation ────────────────────────────────────────────────────────

HEX_TO_MANIM = {
    "#FF6B6B": "RED",
    "#4ECDC4": "TEAL",
    "#FFE66D": "YELLOW",
    "#A8E6CF": "GREEN",
    "#FFFFFF": "WHITE",
    "#000000": "BLACK",
}

def hex_color(hex_str: str) -> str:
    """Return a Manim-compatible color expression from a hex string."""
    if hex_str.upper() in HEX_TO_MANIM:
        return HEX_TO_MANIM[hex_str.upper()]
    # Use ManimColor from hex
    return f'ManimColor("{hex_str}")'


def build_object_code(obj: ManimObject) -> str:
    """Generate the Manim Python code lines to create one mobject."""
    color = hex_color(obj.color)
    x, y = obj.position[0], obj.position[1]
    fill_op = obj.fill_opacity if obj.fill_opacity is not None else 0.7
    sw = obj.stroke_width if obj.stroke_width is not None else 2

    lines = []
    if obj.type == "Circle":
        r = obj.radius or 1.0
        lines.append(f'{obj.id} = Circle(radius={r}, color={color}, fill_opacity={fill_op}, stroke_width={sw})')

    elif obj.type == "Square":
        s = obj.side_length or 2.0
        lines.append(f'{obj.id} = Square(side_length={s}, color={color}, fill_opacity={fill_op}, stroke_width={sw})')

    elif obj.type == "Triangle":
        lines.append(f'{obj.id} = Triangle(color={color}, fill_opacity={fill_op}, stroke_width={sw})')

    elif obj.type == "Rectangle":
        w = obj.width or 3.0
        h = obj.height or 2.0
        lines.append(f'{obj.id} = Rectangle(width={w}, height={h}, color={color}, fill_opacity={fill_op}, stroke_width={sw})')

    elif obj.type == "Line":
        lines.append(f'{obj.id} = Line(start=LEFT * 2, end=RIGHT * 2, color={color}, stroke_width={sw})')

    elif obj.type == "Dot":
        r = obj.radius or 0.12
        lines.append(f'{obj.id} = Dot(radius={r}, color={color})')

    elif obj.type == "Arrow":
        lines.append(f'{obj.id} = Arrow(start=LEFT * 1.5, end=RIGHT * 1.5, color={color}, stroke_width={sw})')

    elif obj.type == "Text":
        raw_text = (obj.text or "Hello!").replace('\\', '\\\\').replace('"', '\\"')
        fs = obj.font_size or 36
        lines.append(f'{obj.id} = Text("{raw_text}", font_size={fs}, color={color})')

    elif obj.type == "MathTex":
        raw_text = (obj.text or r"E = mc^2").replace('"', '\\"')
        fs = obj.font_size or 36
        lines.append(f'{obj.id} = MathTex(r"{raw_text}", font_size={fs}, color={color})')

    elif obj.type == "Star":
        lines.append(f'{obj.id} = Star(color={color}, fill_opacity={fill_op}, stroke_width={sw})')

    else:
        lines.append(f'{obj.id} = Circle(color={color})')  # fallback

    # Apply position
    if x != 0 or y != 0:
        lines.append(f'{obj.id}.move_to(np.array([{x}, {y}, 0]))')

    # Apply scale
    if obj.scale is not None and obj.scale != 1.0 and obj.scale != 0:
        lines.append(f'{obj.id}.scale({obj.scale})')

    return "\n".join(lines)


def build_anim_expr(anim: AnimationStep) -> str:
    """Generate the Manim animation expression string."""
    oid = anim.obj_id

    if anim.type == "FadeIn":
        return f'FadeIn({oid})'
    elif anim.type == "FadeOut":
        return f'FadeOut({oid})'
    elif anim.type == "GrowFromCenter":
        return f'GrowFromCenter({oid})'
    elif anim.type == "Write":
        return f'Write({oid})'
    elif anim.type == "DrawBorderThenFill":
        return f'DrawBorderThenFill({oid})'
    elif anim.type == "Create":
        return f'Create({oid})'
    elif anim.type == "Uncreate":
        return f'Uncreate({oid})'
    elif anim.type == "Transform":
        tid = anim.target_id or oid
        return f'Transform({oid}, {tid})'
    elif anim.type == "Rotate":
        angle = anim.angle or 90.0
        return f'Rotate({oid}, angle={angle} * DEGREES)'
    elif anim.type == "Flash":
        return f'Flash({oid})'
    elif anim.type == "Indicate":
        return f'Indicate({oid})'
    else:
        return f'FadeIn({oid})'


def generate_manim_script(payload: ScenePayload, scene_id: str) -> str:
    """Build a complete, runnable Manim Python script from the payload."""

    # Build object creation lines with clean indentation
    obj_lines = []
    for obj in payload.objects:
        try:
            code_str = build_object_code(obj)
            for line in code_str.splitlines():
                if line.strip():
                    obj_lines.append(f"        {line.strip()}")
        except Exception as e:
            raise ValueError(f"Error building object '{obj.id}': {e}")

    # Sort animations by start_time, then group concurrent ones (same start_time)
    sorted_anims = sorted(payload.animations, key=lambda a: a.start_time)

    anim_lines = []
    i = 0
    while i < len(sorted_anims):
        current_time = sorted_anims[i].start_time
        # Collect all animations that start at the same time
        batch = [sorted_anims[i]]
        while i + 1 < len(sorted_anims) and sorted_anims[i + 1].start_time == current_time:
            i += 1
            batch.append(sorted_anims[i])

        # Filter out Wait if present
        waits = [a for a in batch if a.type == "Wait"]
        anims = [a for a in batch if a.type != "Wait"]

        if waits:
            for w in waits:
                anim_lines.append(f"        self.wait({w.duration})")

        if anims:
            exprs = ", ".join(build_anim_expr(a) for a in anims)
            dur = max(a.duration for a in anims)
            anim_lines.append(f"        self.play({exprs}, run_time={dur})")

        i += 1

    objects_code = "\n".join(obj_lines) if obj_lines else "        pass"
    anims_code = "\n".join(anim_lines) if anim_lines else "        self.wait(1)"

    script = (
        f'from manim import *\n'
        f'import numpy as np\n\n'
        f'config.background_color = ManimColor("{payload.background_color}")\n\n'
        f'class {scene_id}(Scene):\n'
        f'    def construct(self):\n'
        f'        # --- Create objects ---\n'
        f'{objects_code}\n\n'
        f'        # --- Animate ---\n'
        f'{anims_code}\n\n'
        f'        self.wait(0.5)\n'
    )

    return script


# ─── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "Manim EZ"}


@app.post("/render")
async def render_scene(payload: ScenePayload):
    """
    Accept a scene payload, generate a Manim script, run it, and return the video URL.
    """
    if not payload.objects:
        raise HTTPException(status_code=400, detail="Scene has no objects.")

    # Unique render ID
    render_id = uuid.uuid4().hex[:10]
    scene_class = f"Scene_{render_id}"

    # Paths
    script_path = RENDERS_DIR / f"{render_id}.py"
    output_dir = RENDERS_DIR / render_id

    try:
        # 1. Write the generated script to disk
        script = generate_manim_script(payload, scene_class)
        script_path.write_text(script, encoding="utf-8")

        # 2. Determine quality flag
        quality_map = {"low": "-ql", "medium": "-qm", "high": "-qh"}
        q_flag = quality_map.get(payload.quality, "-ql")

        # 3. Run manim CLI (use sys.executable so it always finds manim regardless of PATH)
        import sys
        creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        cmd = [
            sys.executable, "-m", "manim",
            q_flag,
            "--disable_caching",
            "--output_file", render_id,
            "--media_dir", str(output_dir),
            str(script_path),
            scene_class,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            creationflags=creation_flags,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Manim render failed",
                    "stderr": result.stderr[-3000:],
                    "stdout": result.stdout[-1000:],
                    "script": script,
                },
            )

        # 4. Find the rendered file
        video_file = None
        for ext in [".mp4", ".gif", ".webm"]:
            for found in output_dir.rglob(f"*{ext}"):
                video_file = found
                break
            if video_file:
                break

        if not video_file:
            raise HTTPException(status_code=500, detail={
                "error": "Render succeeded but no output file found.",
                "stdout": result.stdout,
                "stderr": result.stderr,
            })

        # 5. Move it to a flat renders/ location for easy serving
        final_path = RENDERS_DIR / f"{render_id}.mp4"
        shutil.move(str(video_file), str(final_path))

        return JSONResponse({
            "url": f"/renders/{render_id}.mp4",
            "render_id": render_id,
            "script": script,
        })

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Render timed out (>120s).")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary script file
        if script_path.exists():
            script_path.unlink()


@app.get("/")
def root():
    return FileResponse("index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
