const database = require('../../shared/database');

module.exports = async function (context, req) {
  const ref = context.bindingData.ref;
  const premises = await database.getPremises(ref);
  if (!premises) {
    context.res = { status: 404, headers: { 'Content-Type': 'application/json' }, body: { error: 'Premises not found' } };
    return;
  }
  const actions = await database.getPreviousActions(ref);
  const inspections = await database.getInspectionsForPremises(ref);
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { ...premises, previousActions: actions, inspections },
  };
};
