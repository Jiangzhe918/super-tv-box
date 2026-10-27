FROM python:3.11-slim

WORKDIR /app

COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ .

EXPOSE 8888

CMD ["python", "pan_search_server.py"]
