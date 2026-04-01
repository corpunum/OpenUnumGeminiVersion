export function getCapabilities(config: { ui: { host?: string; port: number }; appHome?: string }) {
  return {
    contract_version: '2026-04-01.webui-capabilities.v1',
    app_id: 'openunum-gemini',
    app_name: 'OpenUnumGeminiVersion',
    menu: ['chat', 'missions', 'trace', 'runtime', 'settings'],
    quick_prompts: [
      'Trigger a health-oriented mission and summarize recovery actions.',
      'Inspect tactical memory and propose an improved execution strategy.',
      'Run an autonomy stress-check and identify failure pivots.',
      'Review the codebase for self-healing edge cases and patch one.',
    ],
    features: {
      chat: true,
      sessions: true,
      missions: true,
      trace: true,
      model_catalog: true,
      provider_health: true,
      self_heal: true,
      browser_control: true,
      git_runtime: true,
      ghost_monitor: true,
      tactical_memory: true,
      health_monitoring: true,
      memory_inspection: true,
      research: true,
    },
    ui: {
      shell: 'shared-autonomy-v1',
      chat_style: 'imessage',
      skin: 'gemini-graphite',
    },
    runtime: {
      host: config.ui.host || '127.0.0.1',
      port: config.ui.port,
      home: config.appHome || '',
    },
  };
}
