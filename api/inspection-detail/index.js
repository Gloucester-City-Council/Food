const database = require('../../shared/database');

module.exports = async function (context, req) {
  const id = parseInt(context.bindingData.id, 10);
  const inspection = await database.getInspection(id);
  if (!inspection) {
    context.res = { status: 404, headers: { 'Content-Type': 'application/json' }, body: { error: 'Inspection not found' } };
    return;
  }
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: inspection,
  };
};
