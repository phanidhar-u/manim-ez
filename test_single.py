from manim import *
import numpy as np

config.background_color = ManimColor("#1C1C2E")

class TestScene(Scene):
    def construct(self):
        # --- Create objects ---
        obj_1 = Arrow(start=LEFT * 1.5, end=RIGHT * 1.5, color=ManimColor("#7c6af7"), stroke_width=2)

        # --- Animate ---
        self.play(FadeIn(obj_1), run_time=1.0)

        self.wait(0.5)
