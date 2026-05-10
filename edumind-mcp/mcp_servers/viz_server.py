import os
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("edumind-viz")


@mcp.tool()
def plot_chart(chart_type: str, data: str, title: str = "Chart", xlabel: str = "x", ylabel: str = "y") -> str:
    """绘制图表并返回图片路径。支持 line/bar/scatter/pie/histogram。
    data格式: 对于line/scatter为"x1,y1;x2,y2;..."，对于bar/pie为"label1:value1;label2:value2;..."
    例: plot_chart("line", "1,2;2,4;3,1;4,3;5,5", "Sample Line", "x", "y")
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(8, 5))

        if chart_type in ("line", "scatter"):
            xs, ys = [], []
            for point in data.split(";"):
                parts = point.split(",")
                xs.append(float(parts[0]))
                ys.append(float(parts[1]))

            if chart_type == "line":
                ax.plot(xs, ys, marker="o", linewidth=2, color="#4F46E5")
            else:
                ax.scatter(xs, ys, s=80, color="#4F46E5", alpha=0.7)
            ax.set_xlabel(xlabel)
            ax.set_ylabel(ylabel)

        elif chart_type == "bar":
            labels, values = [], []
            for item in data.split(";"):
                k, v = item.split(":")
                labels.append(k.strip())
                values.append(float(v.strip()))
            ax.bar(labels, values, color="#4F46E5", alpha=0.8)
            ax.set_ylabel(ylabel)

        elif chart_type == "pie":
            labels, values = [], []
            for item in data.split(";"):
                k, v = item.split(":")
                labels.append(k.strip())
                values.append(float(v.strip()))
            ax.pie(values, labels=labels, autopct="%1.1f%%", colors=plt.cm.Set3.colors[:len(values)])

        elif chart_type == "histogram":
            values = [float(v.strip()) for v in data.split(",")]
            ax.hist(values, bins=10, color="#4F46E5", alpha=0.7, edgecolor="white")
            ax.set_xlabel(xlabel)
            ax.set_ylabel("Frequency")

        else:
            return f"不支持的图表类型: {chart_type}。支持: line, bar, scatter, pie, histogram"

        ax.set_title(title, fontsize=14)
        ax.grid(True, alpha=0.3) if chart_type != "pie" else None

        path = f"assets/plots/chart_{hash(data) & 0xFFFFFFFF}.png"
        os.makedirs("assets/plots", exist_ok=True)
        fig.savefig(path, dpi=150, bbox_inches="tight")
        plt.close(fig)

        return f"图表已保存: {path}\n类型: {chart_type}\n标题: {title}"
    except Exception as exc:
        return f"绘图错误: {exc}"


@mcp.tool()
def render_latex(latex_str: str) -> str:
    """将LaTeX公式渲染为图片并返回路径。
    例: render_latex("\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}")
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(8, 2))
        ax.text(0.5, 0.5, f"${latex_str}$", fontsize=24, ha="center", va="center",
                transform=ax.transAxes)
        ax.set_axis_off()

        path = f"assets/plots/latex_{hash(latex_str) & 0xFFFFFFFF}.png"
        os.makedirs("assets/plots", exist_ok=True)
        fig.savefig(path, dpi=150, bbox_inches="tight", pad_inches=0.1)
        plt.close(fig)

        return f"LaTeX渲染完成: {path}\n公式: {latex_str}"
    except Exception as exc:
        return f"渲染错误: {exc}"


@mcp.tool()
def animate_function(function: str, x_range: str = "-5,5", param: str = "t", param_range: str = "0,2*pi") -> str:
    """生成函数动画帧（多帧叠加图），展示参数变化效果。
    例: animate_function("sin(x + t)", "-6.28,6.28", "t", "0,6.28")
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
        import sympy

        x_sym = sympy.Symbol("x")
        t_sym = sympy.Symbol(param)

        x_parts = x_range.split(",")
        x_min, x_max = float(x_parts[0]), float(x_parts[1])
        x_vals = np.linspace(x_min, x_max, 500)

        t_parts = param_range.split(",")
        t_min_str, t_max_str = t_parts[0].strip(), t_parts[1].strip()
        t_min = float(sympy.sympify(t_min_str, locals={"pi": np.pi}))
        t_max = float(sympy.sympify(t_max_str, locals={"pi": np.pi}))

        expr = sympy.sympify(function, locals={
            "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan,
            "exp": sympy.exp, "log": sympy.log, "sqrt": sympy.sqrt,
            "pi": sympy.pi, "e": sympy.E,
        })

        fig, ax = plt.subplots(figsize=(8, 5))
        n_frames = 8
        t_values = np.linspace(t_min, t_max, n_frames)
        cmap = plt.cm.viridis

        for i, t_val in enumerate(t_values):
            expr_sub = expr.subs(t_sym, t_val)
            func = sympy.lambdify(x_sym, expr_sub, "numpy")
            y_vals = func(x_vals)
            color = cmap(i / n_frames)
            ax.plot(x_vals, y_vals, linewidth=1.5, alpha=0.7, color=color,
                    label=f"{param}={t_val:.2f}")

        ax.set_title(f"f(x) = {function}", fontsize=14)
        ax.set_xlabel("x")
        ax.legend(loc="upper right", fontsize=8)
        ax.grid(True, alpha=0.3)

        path = f"assets/plots/anim_{hash(function) & 0xFFFFFFFF}.png"
        os.makedirs("assets/plots", exist_ok=True)
        fig.savefig(path, dpi=150, bbox_inches="tight")
        plt.close(fig)

        return f"动画帧已保存: {path}\n函数: f(x) = {function}\n参数: {param} ∈ [{t_min:.2f}, {t_max:.2f}]"
    except Exception as exc:
        return f"动画生成错误: {exc}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
