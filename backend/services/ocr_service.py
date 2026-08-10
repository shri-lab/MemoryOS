"""
Image OCR service module.
Handles image preprocessing using Pillow and text extraction via pytesseract.
"""

import io
import logging
import re
from PIL import Image, ImageEnhance
import pytesseract

logger = logging.getLogger(__name__)


def preprocess_image(image: Image.Image) -> Image.Image:
    """
    Applies Pillow-based preprocessing to enhance OCR accuracy:
    1. Grayscale conversion.
    2. Orientation/Rotation correction using pytesseract OSD.
    3. Contrast enhancement.
    4. Upscaling of low-resolution images.
    
    Args:
        image: PIL Image object.
        
    Returns:
        Preprocessed PIL Image.
    """
    try:
        # 1. Convert to grayscale
        processed = image.convert('L')
        
        # 2. Try deskew / orientation correction using pytesseract OSD
        try:
            osd = pytesseract.image_to_osd(processed)
            angle_match = re.search(r'Rotate:\s*(\d+)', osd)
            if angle_match:
                angle = int(angle_match.group(1))
                if angle != 0:
                    # Pillow rotates counter-clockwise. OSD degrees rotate clockwise.
                    processed = processed.rotate(360 - angle, expand=True)
                    logger.info(f"Preprocess: detected OSD rotation of {angle} degrees. Rotated image counter-clockwise.")
        except Exception as osd_err:
            logger.debug(f"OSD orientation correction bypassed: {osd_err}")

        # 3. Enhance contrast to make text stand out
        contrast = ImageEnhance.Contrast(processed)
        processed = contrast.enhance(2.0)  # Double contrast

        # 4. Upscale image if it's too small
        width, height = processed.size
        if width < 1000 or height < 1000:
            scale_factor = 2.0
            processed = processed.resize(
                (int(width * scale_factor), int(height * scale_factor)),
                Image.Resampling.LANCZOS
            )
            logger.info(f"Preprocess: upscaled image by {scale_factor}x for better OCR recognition.")

        return processed
    except Exception as prep_err:
        logger.warning(f"Error during image preprocessing, using original image: {prep_err}")
        return image


def extract_text_from_image(file_bytes: bytes) -> str:
    """
    Extracts text from raw image file bytes using pytesseract with Pillow preprocessing.
    
    Args:
        file_bytes: Raw bytes of the image file.
        
    Returns:
        The extracted text string.
        
    Raises:
        ValueError: If the image bytes are corrupt or unreadable.
        Exception: For general pytesseract or processing failures.
    """
    if not file_bytes:
        raise ValueError("Empty file bytes provided.")
        
    try:
        # Load image with Pillow
        try:
            image = Image.open(io.BytesIO(file_bytes))
            # Force verification and load to catch corrupt files
            image.load()
        except Exception as img_err:
            logger.error(f"Failed to open or verify image bytes: {img_err}")
            raise ValueError(f"Corrupt or unreadable image file: {img_err}")

        # Apply preprocessing
        processed_image = preprocess_image(image)
        
        # Run OCR using pytesseract
        text = pytesseract.image_to_string(processed_image)
        return text.strip()
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"pytesseract extraction failed: {e}", exc_info=True)
        raise e
