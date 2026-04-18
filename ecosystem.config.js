module.exports = {
  apps: [{
    name: 'ecosunpower-agente',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    env_sandbox: {
      NODE_ENV: 'sandbox'
    }
  }]
};
