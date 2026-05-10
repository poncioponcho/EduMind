import re
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("edumind-paper")

MAX_QUERY_LENGTH = 200
MAX_RESULTS_LIMIT = 10
ARXIV_ID_PATTERN = re.compile(r'^\d{4}\.\d{4,5}(v\d+)?$')


def _validate_query(query: str) -> str | None:
    if not query or not query.strip():
        return "搜索关键词不能为空"
    if len(query) > MAX_QUERY_LENGTH:
        return f"搜索关键词过长（最多{MAX_QUERY_LENGTH}字符）"
    return None


def _validate_arxiv_id(arxiv_id: str) -> str | None:
    if not arxiv_id or not arxiv_id.strip():
        return "ArXiv ID不能为空"
    if not ARXIV_ID_PATTERN.match(arxiv_id.strip()):
        return f"无效的ArXiv ID格式: {arxiv_id}"
    return None


@mcp.tool()
def search_papers(query: str, max_results: int = 5) -> str:
    """搜索ArXiv论文，返回标题、作者和摘要。
    例: search_papers("quantum computing education", 3)
    """
    validation = _validate_query(query)
    if validation:
        return validation

    max_results = max(1, min(max_results, MAX_RESULTS_LIMIT))

    try:
        import arxiv

        search = arxiv.Search(
            query=query.strip(),
            max_results=max_results,
            sort_by=arxiv.SortCriterion.Relevance,
        )

        results = []
        for i, paper in enumerate(search.results()):
            authors = ", ".join(a.name for a in paper.authors[:3])
            if len(paper.authors) > 3:
                authors += " et al."

            results.append(
                f"[{i+1}] {paper.title}\n"
                f"    作者: {authors}\n"
                f"    日期: {paper.published.strftime('%Y-%m-%d')}\n"
                f"    链接: {paper.entry_id}\n"
                f"    摘要: {paper.summary[:200]}..."
            )

        if not results:
            return f"未找到与「{query}」相关的论文"

        header = f"搜索: 「{query}」（共 {len(results)} 篇）\n{'='*50}"
        return header + "\n\n" + "\n\n".join(results)
    except ImportError:
        return "arxiv 库未安装，请运行: pip install arxiv"
    except Exception as exc:
        return f"搜索错误: {type(exc).__name__}"


@mcp.tool()
def get_abstract(arxiv_id: str) -> str:
    """获取指定ArXiv论文的完整摘要。
    例: get_abstract("2301.07041")
    """
    validation = _validate_arxiv_id(arxiv_id)
    if validation:
        return validation

    try:
        import arxiv

        search = arxiv.Search(id_list=[arxiv_id.strip()])
        paper = next(search.results())

        authors = ", ".join(a.name for a in paper.authors)

        return (
            f"标题: {paper.title}\n"
            f"作者: {authors}\n"
            f"日期: {paper.published.strftime('%Y-%m-%d')}\n"
            f"分类: {', '.join(c for c in paper.categories)}\n"
            f"链接: {paper.entry_id}\n"
            f"PDF: {paper.pdf_url}\n\n"
            f"摘要:\n{paper.summary}"
        )
    except StopIteration:
        return f"未找到论文: {arxiv_id}"
    except ImportError:
        return "arxiv 库未安装，请运行: pip install arxiv"
    except Exception as exc:
        return f"获取错误: {type(exc).__name__}"


@mcp.tool()
def get_related(arxiv_id: str, max_results: int = 3) -> str:
    """获取与指定论文相关的推荐论文。
    例: get_related("2301.07041", 3)
    """
    validation = _validate_arxiv_id(arxiv_id)
    if validation:
        return validation

    max_results = max(1, min(max_results, MAX_RESULTS_LIMIT))

    try:
        import arxiv

        search = arxiv.Search(id_list=[arxiv_id.strip()])
        paper = next(search.results())

        title_words = [w for w in paper.title.split() if len(w) > 3][:5]
        related_query = " AND ".join(f'ti:"{w}"' for w in title_words)

        related_search = arxiv.Search(
            query=related_query,
            max_results=max_results + 1,
            sort_by=arxiv.SortCriterion.Relevance,
        )

        results = []
        for r in related_search.results():
            if r.entry_id == paper.entry_id:
                continue
            authors = ", ".join(a.name for a in r.authors[:3])
            if len(r.authors) > 3:
                authors += " et al."
            results.append(
                f"• {r.title}\n"
                f"  作者: {authors} ({r.published.strftime('%Y-%m-%d')})\n"
                f"  链接: {r.entry_id}"
            )

        if not results:
            return f"未找到与「{paper.title}」相关的论文"

        header = f"与「{paper.title}」相关的论文:\n{'='*50}"
        return header + "\n\n" + "\n\n".join(results[:max_results])
    except StopIteration:
        return f"未找到论文: {arxiv_id}"
    except ImportError:
        return "arxiv 库未安装，请运行: pip install arxiv"
    except Exception as exc:
        return f"推荐错误: {type(exc).__name__}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
