const success = (data) => {
  return {
    success: true,
    data: data
  };
};

const error = (message) => {
  return {
    success: false,
    error: message
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
