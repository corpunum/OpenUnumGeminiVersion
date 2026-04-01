export function getCapabilities(config: { ui: { host?: string; port: number }; appHome?: string }) {
  return {
    contract_version: '2026-04-01.webui-capabilities.v1',
    app_id: 'openunum-gemini',
    app_name: 'OpenUnumGeminiVersion',
    menu: ['chat', 'missions', 'trace', 'runtime', 'settings'],
    quick_prompts: [
      'Inspect the current repository and summarize the highest-risk code path.',
      'Create a small test that proves this bug is fixed.',
      'Plan and implement a mission to harden runtime health handling.',
      'Review recent changes and list the most likely regressions.',
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
      memory_inspection: true,
      research: true,
    },
    ui: {
      shell: 'shared-autonomy-v1',
      chat_style: 'imessage',
    },
    runtime: {
      host: config.ui.host || '127.0.0.1',
      port: config.ui.port,
      home: config.appHome || '',
    },
  };
}
