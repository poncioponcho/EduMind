FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data /app/assets/plots

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/health')" || exit 1

CMD ["python", "-m", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8001"]
