import os
import re
import json
import base64
from io import BytesIO
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


@mcp.tool()
def plot_function(
    function: str,
    x_range: str = "-10,10",
    y_range: str = "",
    title: str = "Function Plot",
    special_points: str = "",
    discontinuity_info: str = "",
    piecewise_def: str = ""
) -> str:
    """绘制数学函数图像，支持分段函数、特殊点和间断点标注。

    **基本用法**:
    - plot_function("sin(x)", "-6.28,6.28")
    - plot_function("x**2", "-5,5", "", "抛物线")

    **分段函数 (piecewise_def)**:
    JSON数组格式，每段包含条件、表达式和颜色:
    ```
    piecewise_def='[
      {"expr":"x**2","cond":"x!=2","color":"#4F46E5"},
      {"expr":"1","cond":"x==2","color":"#EF4444"}
    ]'
    ```

    **特殊点标注 (special_points)**:
    JSON数组，每项包含坐标、类型和标签:
    ```
    special_points='[
      {"x":2,"y":4,"type":"open","label":"极限值(2,4)"},
      {"x":2,"y":1,"type":"filled","label":"f(2)=1"}
    ]'
    ```
    type可选: "open"(空心点○), "filled"(实心点●), "arrow"(箭头→)

    **间断点信息 (discontinuity_info)**:
    用于自动添加标准间断点标注:
    - "removable,x=2,lim=4,val=1" → 可去间断点
    - "jump,x=0,left=1,right=-1" → 跳跃间断点

    **示例 - 可去间断点**:
    ```
    plot_function(
      "x**2",
      "-3,3",
      "-1,5",
      "可去间断点示例",
      '[{"x":2,"y":4,"type":"open","label":"lim=4"},{"x":2,"y":1,"type":"filled","label":"f(2)=1"}]',
      "removable,x=2"
    )
    ```

    返回: 图像的Base64编码JSON + 元数据，可直接在前端显示
    """
    if len(function) > 500:
        return "函数表达式过长（最多500字符）"

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
        from matplotlib.patches import FancyBboxPatch
        import matplotlib.patches as mpatches

        fig, ax = plt.subplots(figsize=(12, 7))

        # 解析x范围
        x_parts = x_range.split(",")
        if len(x_parts) != 2:
            return "x_range格式错误，应为 'min,max'"
        x_min, x_max = float(x_parts[0]), float(x_parts[1])

        # 解析y范围（可选）
        if y_range:
            y_parts = y_range.split(",")
            if len(y_parts) == 2:
                y_min, y_max = float(y_parts[0]), float(y_parts[1])
            else:
                y_min, y_max = None, None
        else:
            y_min, y_max = None, None

        x_fine = np.linspace(x_min, x_max, 1000)

        # 绘制分段函数或普通函数
        if piecewise_def:
            pieces = json.loads(piecewise_def)
            for piece in pieces:
                expr_str = piece.get("expr", "")
                cond = piece.get("cond", "True")
                color = piece.get("color", "#4F46E5")

                # 根据条件生成掩码
                mask = np.ones_like(x_fine, dtype=bool)
                if "!=" in cond:
                    val = float(cond.split("!=")[1].strip())
                    mask = np.abs(x_fine - val) > 0.01
                elif "==" in cond:
                    val = float(cond.split("==")[1].strip())
                    mask = np.abs(x_fine - val) <= 0.01
                elif "<" in cond or ">" in cond:
                    mask = eval(f"x_fine{cond}", {"x_fine": x_fine, "__builtins__": {}})
                elif ">=" in cond or "<=" in cond:
                    mask = eval(f"x_fine{cond}", {"x_fine": x_fine, "__builtins__": {}})

                x_masked = x_fine[mask]

                # 安全计算函数值
                try:
                    y_values = eval(expr_str, {
                        "x": x_masked, "np": np,
                        "sin": np.sin, "cos": np.cos, "tan": np.tan,
                        "exp": np.exp, "log": np.log, "sqrt": np.sqrt,
                        "pi": np.pi, "e": np.e, "abs": np.abs,
                        "__builtins__": {}
                    })
                    y_values = np.array(y_values, dtype=float)

                    # 过滤无穷大和NaN
                    valid = np.isfinite(y_values)
                    ax.plot(x_masked[valid], y_values[valid], linewidth=2.5,
                           color=color, label=f"{expr_str} ({cond})")
                except Exception as e:
                    pass
        else:
            # 普通函数绘制
            try:
                y_values = eval(function, {
                    "x": x_fine, "np": np,
                    "sin": np.sin, "cos": np.cos, "tan": np.tan,
                    "exp": np.exp, "log": np.log, "sqrt": np.sqrt,
                    "pi": np.pi, "e": np.e, "abs": np.abs,
                    "__builtins__": {}
                })
                y_values = np.array(y_values, dtype=float)

                valid = np.isfinite(y_values)
                ax.plot(x_fine[valid], y_values[valid], linewidth=2.5,
                       color="#4F46E5", label=f"f(x) = {function}")
            except Exception as e:
                return f"函数计算错误: {e}"

        # 添加特殊点标注
        if special_points:
            points = json.loads(special_points)
            for pt in points:
                px, py = pt.get("x", 0), pt.get("y", 0)
                ptype = pt.get("type", "filled")
                label = pt.get("label", "")

                if ptype == "open":
                    # 空心点 ○ (表示极限值但函数未定义或不等于此值)
                    ax.scatter(px, py, s=120, facecolors='white', edgecolors='#EF4444',
                              linewidths=2.5, zorder=5)
                    if label:
                        offset_y = 0.3 if any(p.get('y', 0) > py for p in points if p != pt) else -0.4
                        ax.annotate(label, (px, py), textcoords="offset points",
                                   xytext=(10, 15 * (1 if offset_y > 0 else -1)),
                                   fontsize=9, color='#DC2626',
                                   bbox=dict(boxstyle='round,pad=0.3', facecolor='#FEF2F2',
                                            edgecolor='#FECACA', alpha=0.9),
                                   arrowprops=dict(arrowstyle='->', color='#DC2626'))

                elif ptype == "filled":
                    # 实心点 ● (表示实际函数值)
                    ax.scatter(px, py, s=120, facecolors='#10B981',
                              edgecolors='#065F46', linewidths=2, zorder=5)
                    if label:
                        offset_y = 0.3 if any(p.get('y', 0) > py for p in points if p != pt) else -0.4
                        ax.annotate(label, (px, py), textcoords="offset points",
                                   xytext=(10, 15 * (1 if offset_y > 0 else -1)),
                                   fontsize=9, color='#059669',
                                   bbox=dict(boxstyle='round,pad=0.3', facecolor='#ECFDF5',
                                            edgecolor='#A7F3D0', alpha=0.9),
                                   arrowprops=dict(arrowstyle='->', color='#059669'))

                elif ptype == "arrow":
                    # 箭头标注
                    ax.annotate('', xy=(px, py), xytext=(px - 1, py + 1),
                               arrowprops=dict(arrowstyle='->', color='#6366F1', lw=2))

        # 自动处理间断点信息
        if discontinuity_info:
            parts = discontinuity_info.split(",")
            dtype = parts[0]

            if dtype == "removable":
                # 可去间断点：空心点+实心点
                x_disc = float(parts[1].split("=")[1]) if "=" in parts[1] else float(parts[1])
                lim_val = float(parts[2].split("=")[1]) if len(parts) > 2 and "=" in parts[2] else None
                func_val = float(parts[3].split("=")[1]) if len(parts) > 3 and "=" in parts[3] else lim_val - 1 if lim_val else None

                if lim_val is not None:
                    ax.scatter(x_disc, lim_val, s=140, facecolors='white',
                              edgecolors='#EF4444', linewidths=3, zorder=5)
                    ax.annotate(f'极限值({x_disc},{lim_val})', (x_disc, lim_val),
                               textcoords="offset points", xytext=(15, 15),
                               fontsize=10, fontweight='bold', color='#DC2626',
                               bbox=dict(boxstyle='round,pad=0.4', facecolor='#FEF2F2',
                                        edgecolor='#FECACA'),
                               arrowprops=dict(arrowstyle='->', color='#DC2626', lw=2))

                if func_val is not None and func_val != lim_val:
                    ax.scatter(x_disc, func_val, s=140, facecolors='#10B981',
                              edgecolors='#065F46', linewidths=3, zorder=5)
                    ax.annotate(f'f({x_disc})={func_val}', (x_disc, func_val),
                               textcoords="offset points", xytext=(15, -20),
                               fontsize=10, fontweight='bold', color='#059669',
                               bbox=dict(boxstyle='round,pad=0.4', facecolor='#ECFDF5',
                                        edgecolor='#A7F3D0'),
                               arrowprops=dict(arrowstyle='->', color='#059669', lw=2))

                # 添加虚线连接
                if lim_val is not None and func_val is not None:
                    ax.plot([x_disc, x_disc], [func_val, lim_val],
                           '--', color='#9CA3AF', linewidth=1.5, alpha=0.7)

            elif dtype == "jump":
                # 跳跃间断点
                x_disc = float(parts[1].split("=")[1]) if "=" in parts[1] else float(parts[1])
                left_val = float(parts[2].split("=")[1]) if len(parts) > 2 else None
                right_val = float(parts[3].split("=")[1]) if len(parts) > 3 else None

                if left_val is not None:
                    ax.scatter(x_disc, left_val, s=100, facecolors='white',
                              edgecolors='#F59E0B', linewidths=2.5, zorder=5,
                              marker='o')
                    ax.annotate(f'左极限={left_val}', (x_disc, left_val),
                               textcoords="offset points", xytext=(-60, 10),
                               fontsize=9, color='#D97706')

                if right_val is not None:
                    ax.scatter(x_disc, right_val, s=100, facecolors='#F59E0B',
                              edgecolors='#D97706', linewidths=2.5, zorder=5,
                              marker='o')
                    ax.annotate(f'右极限={right_val}', (x_disc, right_val),
                               textcoords="offset points", xytext=(10, 10),
                               fontsize=9, color='#D97706')

        # 设置图像属性
        ax.set_title(title, fontsize=16, fontweight='bold', pad=20)
        ax.set_xlabel("x", fontsize=12)
        ax.set_ylabel("f(x)", fontsize=12)
        ax.axhline(y=0, color='#6B7280', linewidth=0.8, linestyle='-', alpha=0.5)
        ax.axvline(x=0, color='#6B7280', linewidth=0.8, linestyle='-', alpha=0.5)
        ax.grid(True, alpha=0.3, linestyle='--')
        ax.legend(loc='upper right', fontsize=10, framealpha=0.95)

        if y_min is not None and y_max is not None:
            ax.set_ylim(y_min, y_max)

        ax.set_xlim(x_min, x_max)

        # 调整布局
        plt.tight_layout()

        # 保存为PNG并转换为Base64
        buffer = BytesIO()
        fig.savefig(buffer, format='png', dpi=150, bbox_inches='tight',
                   facecolor='white', edgecolor='none')
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        plt.close(fig)

        # 同时保存文件版本
        path = _safe_plot_path("func", function)
        with open(path, 'wb') as f:
            f.write(base64.b64decode(img_base64))

        result = {
            "success": True,
            "image_base64": img_base64,
            "image_url": f"assets/plots/{os.path.basename(path)}",
            "metadata": {
                "function": function,
                "title": title,
                "x_range": [x_min, x_max],
                "has_special_points": bool(special_points),
                "discontinuity_type": discontinuity_info.split(",")[0] if discontinuity_info else None
            }
        }

        return json.dumps(result, ensure_ascii=False)

    except json.JSONDecodeError as e:
        return f"JSON解析错误: {e}。请检查special_points或piecewise_def的格式"
    except Exception as exc:
        return f"绘图错误: {type(exc).__name__}: {str(exc)[:200]}"


@mcp.tool()
def create_interactive_plot(
    function: str,
    interaction_type: str = "zoom",
    annotations: str = ""
) -> str:
    """生成交互式函数图像配置（用于前端Canvas/WebGL渲染）。

    **交互类型**:
    - zoom: 支持鼠标滚轮缩放
    - pan: 支持拖拽平移
    - annotate: 支持点击添加标注
    - all: 全部交互功能

    **标注 (annotations)**:
    JSON格式: [{"x":1,"y":2,"text":"极大值点"},{"x":-1,"text":"对称轴"}]

    **返回**: 包含绘图数据和交互配置的JSON，前端可据此渲染可交互图像

    示例: create_interactive_plot("x**3 - 3*x", "all", '[{"x":1,"y":-2,"text":"极小值"}]')
    """
    try:
        import numpy as np

        x_min, x_max = -10, 10
        x_data = np.linspace(x_min, x_max, 500)

        y_data = eval(function, {
            "x": x_data, "np": np,
            "sin": np.sin, "cos": np.cos, "tan": np.tan,
            "exp": np.exp, "log": np.log, "sqrt": np.sqrt,
            "pi": np.pi, "e": np.e, "abs": np.abs,
            "__builtins__": {}
        })

        valid = np.isfinite(np.array(y_data, dtype=float))
        x_list = x_data[valid].tolist()
        y_list = np.array(y_data[valid]).tolist()

        ann_list = json.loads(annotations) if annotations else []

        config = {
            "type": "interactive_plot",
            "data": {
                "x": x_list,
                "y": y_list,
                "function": function
            },
            "interaction": {
                "zoom": interaction_type in ["zoom", "all"],
                "pan": interaction_type in ["pan", "all"],
                "annotate": interaction_type in ["annotate", "all"],
                "download": True
            },
            "annotations": ann_list,
            "view": {
                "x_range": [x_min, x_max],
                "auto_scale": True
            },
            "style": {
                "line_color": "#4F46E5",
                "line_width": 2.5,
                "grid": True,
                "axes": True
            }
        }

        return json.dumps(config, ensure_ascii=False)

    except Exception as e:
        return f"配置生成错误: {e}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
