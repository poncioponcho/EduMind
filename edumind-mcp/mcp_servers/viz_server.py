import os
import re
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("edumind-viz")

PLOTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "plots"))

MAX_DATA_LENGTH = 2000
MAX_TITLE_LENGTH = 100

VALID_CHART_TYPES = {"line", "bar", "scatter", "pie", "histogram"}


def _safe_plot_path(prefix: str, data: str) -> str:
    filename = f"{prefix}_{abs(hash(data)) & 0xFFFFFFFF}.png"
    filepath = os.path.join(PLOTS_DIR, filename)
    real_path = os.path.realpath(os.path.dirname(filepath))
    if not real_path.startswith(os.path.realpath(PLOTS_DIR)):
        raise ValueError("非法路径")
    os.makedirs(PLOTS_DIR, exist_ok=True)
    return filepath


def _validate_chart_input(chart_type: str, data: str, title: str) -> str | None:
    if chart_type not in VALID_CHART_TYPES:
        return f"不支持的图表类型: {chart_type}。支持: {', '.join(VALID_CHART_TYPES)}"
    if len(data) > MAX_DATA_LENGTH:
        return f"数据过长（最多{MAX_DATA_LENGTH}字符）"
    if len(title) > MAX_TITLE_LENGTH:
        return f"标题过长（最多{MAX_TITLE_LENGTH}字符）"
    return None


@mcp.tool()
def plot_chart(chart_type: str, data: str, title: str = "Chart", xlabel: str = "x", ylabel: str = "y") -> str:
    """绘制图表并返回图片路径。支持 line/bar/scatter/pie/histogram。
    data格式: 对于line/scatter为"x1,y1;x2,y2;..."，对于bar/pie为"label1:value1;label2:value2;..."
    例: plot_chart("line", "1,2;2,4;3,1;4,3;5,5", "Sample Line", "x", "y")
    """
    validation = _validate_chart_input(chart_type, data, title)
    if validation:
        return validation

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(8, 5))

        if chart_type in ("line", "scatter"):
            xs, ys = [], []
            for point in data.split(";"):
                parts = point.split(",")
                if len(parts) != 2:
                    return f"数据格式错误: '{point}' 应为 'x,y'"
                try:
                    xs.append(float(parts[0]))
                    ys.append(float(parts[1]))
                except ValueError:
                    return f"数据格式错误: '{point}' 中的值不是有效数字"

            if chart_type == "line":
                ax.plot(xs, ys, marker="o", linewidth=2, color="#4F46E5")
            else:
                ax.scatter(xs, ys, s=80, color="#4F46E5", alpha=0.7)
            ax.set_xlabel(xlabel[:50])
            ax.set_ylabel(ylabel[:50])

        elif chart_type == "bar":
            labels, values = [], []
            for item in data.split(";"):
                k, v = item.split(":")
                labels.append(k.strip()[:20])
                values.append(float(v.strip()))
            ax.bar(labels, values, color="#4F46E5", alpha=0.8)
            ax.set_ylabel(ylabel[:50])

        elif chart_type == "pie":
            labels, values = [], []
            for item in data.split(";"):
                k, v = item.split(":")
                labels.append(k.strip()[:20])
                values.append(float(v.strip()))
            ax.pie(values, labels=labels, autopct="%1.1f%%", colors=plt.cm.Set3.colors[:len(values)])

        elif chart_type == "histogram":
            values = [float(v.strip()) for v in data.split(",")]
            ax.hist(values, bins=10, color="#4F46E5", alpha=0.7, edgecolor="white")
            ax.set_xlabel(xlabel[:50])
            ax.set_ylabel("Frequency")

        ax.set_title(title[:MAX_TITLE_LENGTH], fontsize=14)
        if chart_type != "pie":
            ax.grid(True, alpha=0.3)

        path = _safe_plot_path("chart", data)
        fig.savefig(path, dpi=150, bbox_inches="tight")
        plt.close(fig)

        return f"图表已保存: assets/plots/{os.path.basename(path)}\n类型: {chart_type}\n标题: {title}"
    except ValueError as e:
        return f"数据格式错误: {e}"
    except Exception as exc:
        return f"绘图错误: {type(exc).__name__}"


@mcp.tool()
def render_latex(latex_str: str) -> str:
    """将LaTeX公式渲染为图片并返回路径。
    例: render_latex("\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}")
    """
    if len(latex_str) > 500:
        return "LaTeX公式过长（最多500字符）"

    for pattern in [r"__", r"import\s", r"exec\s*\(", r"eval\s*\("]:
        if re.search(pattern, latex_str):
            return "LaTeX公式包含不允许的操作"

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(8, 2))
        ax.text(0.5, 0.5, f"${latex_str}$", fontsize=24, ha="center", va="center",
                transform=ax.transAxes)
        ax.set_axis_off()

        path = _safe_plot_path("latex", latex_str)
        fig.savefig(path, dpi=150, bbox_inches="tight", pad_inches=0.1)
        plt.close(fig)

        return f"LaTeX渲染完成: assets/plots/{os.path.basename(path)}\n公式: {latex_str}"
    except Exception as exc:
        return f"渲染错误: {type(exc).__name__}"


@mcp.tool()
def animate_function(function: str, x_range: str = "-5,5", param: str = "t", param_range: str = "0,2*pi") -> str:
    """生成函数动画帧（多帧叠加图），展示参数变化效果。
    例: animate_function("sin(x + t)", "-6.28,6.28", "t", "0,6.28")
    """
    if len(function) > 200:
        return "函数表达式过长（最多200字符）"
    if not re.match(r'^[a-zA-Z]$', param):
        return "参数名必须是单个字母"

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
        import sympy

        x_sym = sympy.Symbol("x")
        t_sym = sympy.Symbol(param)

        x_parts = x_range.split(",")
        if len(x_parts) != 2:
            return "x_range格式错误，应为 'min,max'"
        x_min, x_max = float(x_parts[0]), float(x_parts[1])

        t_parts = param_range.split(",")
        if len(t_parts) != 2:
            return "param_range格式错误，应为 'min,max'"
        t_min = float(sympy.sympify(t_parts[0].strip(), locals={"pi": np.pi}))
        t_max = float(sympy.sympify(t_parts[1].strip(), locals={"pi": np.pi}))

        x_vals = np.linspace(x_min, x_max, 500)

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

        path = _safe_plot_path("anim", function)
        fig.savefig(path, dpi=150, bbox_inches="tight")
        plt.close(fig)

        return f"动画帧已保存: assets/plots/{os.path.basename(path)}\n函数: f(x) = {function}\n参数: {param} ∈ [{t_min:.2f}, {t_max:.2f}]"
    except Exception as exc:
        return f"动画生成错误: {type(exc).__name__}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
