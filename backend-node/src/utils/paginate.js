
function paginate(data, params) {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  const offset = (page - 1) * limit;

  const totalRecords = data.length;
  const totalPages = Math.ceil(totalRecords / limit);
  const paginatedData = data.slice(offset, offset + limit);

  return {
    data: paginatedData,
    pagination: {
      totalRecords,
      totalPages,
      currentPage: page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

module.exports = { paginate };
