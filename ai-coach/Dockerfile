FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY coach.py .

ENV COACH_PORT=8090
EXPOSE 8090
USER nobody

# The check hits the service's own /health; it never calls Bedrock, so a
# healthy container costs nothing when idle.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4).status == 200 else 1)"

CMD ["python", "coach.py"]
