FROM python:3.11-slim

WORKDIR /app

COPY app.py .
COPY . .

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5050  

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5050"]