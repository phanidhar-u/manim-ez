# ✦ Manim EZ — Visual Animation Builder

A visual drag-and-drop builder for creating [Manim](https://www.manim.community/) mathematical animations in your browser. Design scenes visually, inspect generated Python code, and render high-quality MP4 videos.

---

## 🚀 Features

- **Visual Canvas & Drag-and-Drop**: Drag mobjects (`Circle`, `Square`, `Triangle`, `Rectangle`, `Line`, `Dot`, `Arrow`, `Star`, `Text`, `MathTex`) onto the canvas.
- **Interactive Editing**: Click and move elements, tweak colors, fill opacity, stroke width, font size, scale, and exact positions in real time.
- **Animation Sequencing**: Add animation steps (`FadeIn`, `FadeOut`, `GrowFromCenter`, `Create`, `Write`, `DrawBorderThenFill`, `Uncreate`, `Rotate`, `Flash`, `Indicate`).
- **Live Manim Render Engine**: Powered by a FastAPI backend that dynamically compiles Python Manim scripts and executes the Manim CLI.
- **Python Code Viewer**: Inspect clean, runnable Manim Python code generated from your visual scene.
- **Quality Control & Download**: Choose between Low, Medium, and High render quality, preview videos directly in the app, and download MP4s.

---

## 🛠️ Prerequisites

1. **Python 3.9+**
2. **Manim Community Edition** and system dependencies (FFmpeg, LaTeX/MiKTeX for `MathTex`).
   - For detailed installation guide, see [Manim Installation Guide](https://docs.manim.community/en/stable/installation.html).

---

## 📦 Installation & Setup

1. **Clone or Navigate to the Project Folder**:
   ```cmd
   cd c:\Users\91863\manim-ez
   ```

2. **Install Python Dependencies**:
   ```cmd
   pip install -r requirements.txt
   ```
   *(If Manim is not installed in your Python environment yet, run `pip install manim`)*

3. **Start the FastAPI Server**:
   ```cmd
   python server.py
   ```

4. **Open in Browser**:
   Navigate to **[http://localhost:8000](http://localhost:8000)** (or **http://127.0.0.1:8000**) in your web browser.

---

## 📁 Project Structure

```text
manim-ez/
├── server.py         # FastAPI server, Python script generator & Manim CLI runner
├── index.html        # Main workspace UI layout (Palette, Canvas, Properties, Preview)
├── app.js            # Frontend logic, drag-and-drop, state management & API client
├── style.css         # Modern dark-theme stylesheet & design tokens
├── requirements.txt  # Python package dependencies
└── renders/          # Rendered video outputs and temporary script files
```

---

## 💡 How It Works

1. **Design**: Drag shapes or text onto the canvas from the left **Elements** panel.
2. **Customize**: Click any object on the canvas to edit properties (color, size, positioning, text) and add animation steps in the right **Properties** panel.
3. **Render**: Click the **▶ Render** button in the top bar to generate the Python script and compile your animation video using Manim.
4. **Export**: Preview the rendered MP4 directly in the bottom panel or click **⌨ Code** to view and copy the generated Python script.

---

## 📄 License

MIT License.
