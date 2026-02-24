const config = require("config");
const redis = require("redis");

// Support Upstash and other Redis services that provide full connection URLs
// REDIS_URL format: redis://[password@]host:port or rediss://[password@]host:port (SSL)
// Example: rediss://default:password@hostname.upstash.io:6379
// If REDIS_URL is not provided, construct URL from BLOT_REDIS_HOST and port
const url = process.env.REDIS_URL || 
  `redis://${config.redis.host}:${config.redis.port}`;

module.exports = function () {
  const client = redis.createClient({ url });

  client.on("error", function (err) {
    console.log("Redis Error:");
    console.log(err);
    if (err.trace) console.log(err.trace);
    if (err.stack) console.log(err.stack);
  });

  return client;
};
