'use strict';

/**
 * Driver registry. FamilyTV is device-driver based from day one: the API and
 * AI talk to one TvDriver interface, and the driver translates to a specific
 * streamer. V1 ships `google-tv`; `roku` etc. can be added later (the Roku
 * ECP implementation lives in the sibling `roku/` project for now).
 */

const googleTv = require('./google-tv');

const DRIVERS = {
  'google-tv': googleTv,
};

function getDriver(nameOrEnv) {
  const name = nameOrEnv || process.env.DRIVER || 'google-tv';
  const driver = DRIVERS[name];
  if (!driver) {
    throw new Error(`Unknown driver "${name}". Available: ${Object.keys(DRIVERS).join(', ')}`);
  }
  return driver;
}

module.exports = { getDriver, DRIVERS };
