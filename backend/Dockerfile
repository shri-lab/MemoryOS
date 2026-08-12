# Use a slim Python 3.10 base image
FROM python:3.10-slim

# Install system dependencies required for Tesseract OCR and compiling Python packages
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy dependency requirements
COPY requirements.txt .

# Install Python packages using the CPU-only PyTorch index to keep the image slim
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the default port (Render uses port 10000 by default for web services)
EXPOSE 10000

# Run FastAPI using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
