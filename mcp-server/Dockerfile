FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .

ENV GRABIUM_MCP_PORT=8096
EXPOSE 8096
USER nobody

# Checks that the server accepts connections; it deliberately does not call
# a tool, which would hit the public edge API every 30 seconds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import socket; socket.create_connection(('127.0.0.1', 8096), 3).close()"

CMD ["python", "server.py"]
