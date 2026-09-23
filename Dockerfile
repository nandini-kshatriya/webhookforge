FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x start.sh

EXPOSE 8000

# docker-compose overrides this CMD for the "api" and "worker" services above.
# Render (no override) runs start.sh, which runs API + worker together.
CMD ["./start.sh"]
