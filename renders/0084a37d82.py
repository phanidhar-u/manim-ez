from manim import *
import numpy as np

config.background_color = ManimColor("#1C1C2E")

class Scene_0084a37d82(Scene):
    def construct(self):
        # --- Create objects ---
        obj_1 = Circle(radius=1.0, color=ManimColor("#7c6af7"), fill_opacity=0.7, stroke_width=2)
        obj_2 = Square(side_length=2.0, color=ManimColor("#f87171"), fill_opacity=0.7, stroke_width=2)
        obj_2.move_to(np.array([2.0, 0.0, 0]))

        # --- Animate ---
        self.play(FadeIn(obj_1), FadeIn(obj_2), run_time=1.0)

        self.wait(0.5)
