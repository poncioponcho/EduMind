from mcp.server.fastmcp import FastMCP

mcp = FastMCP("edumind-paper")


@mcp.tool()
def search_papers(query: str, max_results: int = 5) -> str:
    """搜索ArXiv论文，返回标题、作者和摘要。
    例: search_papers("quantum computing education", 3)
    """
    try:
        import arxiv

        search = arxiv.Search(
            query=query,
            max_results=min(max_results, 10),
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
        return f"搜索错误: {exc}"


@mcp.tool()
def get_abstract(arxiv_id: str) -> str:
    """获取指定ArXiv论文的完整摘要。
    例: get_abstract("2301.07041")
    """
    try:
        import arxiv

        search = arxiv.Search(id_list=[arxiv_id])
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
        return f"获取错误: {exc}"


@mcp.tool()
def get_related(arxiv_id: str, max_results: int = 3) -> str:
    """获取与指定论文相关的推荐论文。
    例: get_related("2301.07041", 3)
    """
    try:
        import arxiv

        search = arxiv.Search(id_list=[arxiv_id])
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
        return f"推荐错误: {exc}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
