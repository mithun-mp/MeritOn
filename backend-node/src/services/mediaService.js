const cloudinary = require('cloudinary').v2;

// Configure Cloudinary to use CLOUDINARY_URL from environment
cloudinary.config({
  secure: true
});

function isCloudinaryConfigured() {
  return !!process.env.CLOUDINARY_URL;
}

function getDefaultMediaObject() {
  return {
    type: 'none',
    url: '',
    publicId: '',
    alt: '',
    width: 0,
    height: 0,
    bytes: 0,
    format: '',
    provider: ''
  };
}

function normalizeMediaObject(input) {
  if (!input || typeof input !== 'object') {
    return getDefaultMediaObject();
  }

  const url = String(input.url || '').trim();
  
  // Reject data:image URLs
  if (url.startsWith('data:image')) {
    return getDefaultMediaObject();
  }
  
  // Reject javascript: and blob: URLs
  if (url.startsWith('javascript:') || url.startsWith('blob:')) {
    return getDefaultMediaObject();
  }
  
  // Validate URL is http or https only
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    return getDefaultMediaObject();
  }
  
  // Max URL length
  if (url.length > 1000) {
    return getDefaultMediaObject();
  }

  return {
    type: url ? 'image' : 'none',
    url: url,
    publicId: String(input.publicId || '').trim().substring(0, 300),
    alt: String(input.alt || '').trim().substring(0, 200),
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    bytes: Number(input.bytes) || 0,
    format: String(input.format || '').trim(),
    provider: String(input.provider || '').trim()
  };
}

function normalizeQuestionMedia(input) {
  return normalizeMediaObject(input);
}

function normalizeOptionMedia(input, mode) {
  // mode can be 'draft' (lowercase keys) or 'final' (uppercase keys)
  const normalized = {};
  
  if (mode === 'draft') {
    normalized.a = normalizeMediaObject(input?.a);
    normalized.b = normalizeMediaObject(input?.b);
    normalized.c = normalizeMediaObject(input?.c);
    normalized.d = normalizeMediaObject(input?.d);
  } else {
    normalized.A = normalizeMediaObject(input?.A);
    normalized.B = normalizeMediaObject(input?.B);
    normalized.C = normalizeMediaObject(input?.C);
    normalized.D = normalizeMediaObject(input?.D);
  }
  
  return normalized;
}

function generateMediaAltText({ role, optionLabel, questionText, optionText }) {
  if (role === 'question') {
    if (questionText && questionText.trim()) {
      return questionText.trim().substring(0, 80);
    }
    return 'Question image';
  }
  
  // Option media
  if (optionText && optionText.trim()) {
    return `Option ${optionLabel}: ${optionText.trim().substring(0, 80)}`;
  }
  return `Option ${optionLabel} image`;
}

async function uploadImageToCloudinary(file, options = {}) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Image upload is not configured.');
  }

  const {
    folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'meriton/question-media',
    publicId = null
  } = options;

  const uploadOptions = {
    resource_type: 'image',
    folder,
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    quality: 'auto',
    fetch_format: 'auto'
  };

  if (publicId) {
    uploadOptions.public_id = publicId;
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }).end(file.buffer);
  });
}

function validateImageFile(file, mediaRole) {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Validate mimetype
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { valid: false, error: 'Invalid file type. Only JPG, PNG, and WebP images are allowed.' };
  }

  // Validate size
  const maxQuestionBytes = Number(process.env.CLOUDINARY_MAX_QUESTION_IMAGE_BYTES) || 1048576;
  const maxOptionBytes = Number(process.env.CLOUDINARY_MAX_OPTION_IMAGE_BYTES) || 716800;
  
  const maxSize = mediaRole === 'question' ? maxQuestionBytes : maxOptionBytes;
  
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
    return { valid: false, error: `File too large. Maximum size is ${maxSizeMB} MB.` };
  }

  return { valid: true };
}

module.exports = {
  isCloudinaryConfigured,
  getDefaultMediaObject,
  normalizeMediaObject,
  normalizeQuestionMedia,
  normalizeOptionMedia,
  generateMediaAltText,
  uploadImageToCloudinary,
  validateImageFile
};
