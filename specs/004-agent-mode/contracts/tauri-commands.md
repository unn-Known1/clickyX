# Tauri Commands: Agent Mode

## Commands

### list_agents
- **Signature**: `fn list_agents(state: State<Mutex<AgentState>>) -> Result<Vec<AgentSession>, String>`
- **Returns**: All agent sessions

### create_agent
- **Signature**: `fn create_agent(name: String, slug: String, skills: Vec<String>, state: State<Mutex<AgentState>>) -> Result<AgentSession, String>`
- **Description**: Create new agent session

### run_agent
- **Signature**: `async fn run_agent(slug: String, prompt: String, state: State<Mutex<AgentState>>) -> Result<(), String>`
- **Description**: Start agent execution with prompt

### stop_agent
- **Signature**: `fn stop_agent(slug: String, state: State<Mutex<AgentState>>) -> Result<(), String>`
- **Description**: Stop running agent

### archive_agent
- **Signature**: `fn archive_agent(slug: String, state: State<Mutex<AgentState>>) -> Result<(), String>`
- **Description**: Archive agent session

### get_agent_status
- **Signature**: `fn get_agent_status(slug: String, state: State<Mutex<AgentState>>) -> Result<AgentSession, String>`
- **Description**: Get agent state

### get_agent_transcript
- **Signature**: `fn get_agent_transcript(slug: String, state: State<Mutex<AgentState>>) -> Result<Vec<ChatMessage>, String>`
- **Description**: Get agent chat transcript

### list_skills
- **Signature**: `fn list_skills() -> Result<Vec<Skill>, String>`
- **Description**: List available skills

### enable_skill
- **Signature**: `fn enable_skill(slug: String, skill_name: String, state: State<Mutex<AgentState>>) -> Result<(), String>`
- **Description**: Enable skill for agent

### disable_skill
- **Signature**: `fn disable_skill(slug: String, skill_name: String, state: State<Mutex<AgentState>>) -> Result<(), String>`
- **Description**: Disable skill for agent

### start_codex
- **Signature**: `fn start_codex(app: AppHandle, codex_state: State<Mutex<CodexState>>) -> Result<(), String>`
- **Description**: Start Codex process

### stop_codex
- **Signature**: `fn stop_codex(codex_state: State<Mutex<CodexState>>) -> Result<(), String>`
- **Description**: Stop Codex process

### get_codex_status
- **Signature**: `fn get_codex_status(codex_state: State<Mutex<CodexState>>) -> Result<bool, String>`
- **Description**: Check if Codex is running

### get_agent_config
- **Signature**: `fn get_agent_config(app: AppHandle) -> Result<AgentConfig, String>`
- **Description**: Get agent config

### update_agent_config
- **Signature**: `fn update_agent_config(app: AppHandle, partial: serde_json::Value) -> Result<AgentConfig, String>`
- **Description**: Update agent settings
