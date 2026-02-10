const database = require('../../shared/database');

module.exports = async function (context, req) {
  const premises = await database.getAllPremises();
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { count: premises.length, data: premises },
  };
};
