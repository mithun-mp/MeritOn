const success = (data = {}, message = 'Operation completed successfully') => {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      success: true,
      message,
      data,
      errors: null,
      ...data
    };
  }
  return {
    success: true,
    message,
    data,
    errors: null
  };
};

const error = (message = 'An error occurred', errorsList = null, data = null) => {
  const errArr = Array.isArray(errorsList) ? errorsList : [message];
  return {
    success: false,
    message,
    data,
    error: message,
    errors: errArr
  };
};

const notImplemented = () => {
  return error("Action not implemented yet");
};

module.exports = {
  success,
  error,
  notImplemented
};
