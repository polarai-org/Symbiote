# Symbiote
The symbiote for your AI agent.
---
Plan:
Please note: Cross-platform compat isnt required, just get Linux (Systemd) working
- [ ] Base daemon / service for AI comms (High prio)
   - [ ] Provider agnostic interface (Take inspo from Xenon or JarvisCore)
   - [ ] Basic model features
   - [ ] Provider-agnostic function definitions and executions
   - [ ] Basic memory management
   - [ ] Skill management (loading, unloading, listing)
- [ ] Chat interface
(Please note, the skill for chatting should be put in the system message and not received via a function call, this is because LLMs tend to give higher attention to contents in the system channel.)
   - [ ] Discord (self)bot
   - [ ] WhatsApp bot (Baileys / WABusiness API)
   - [ ] Telegram bot
   - [ ] Optional API or web UI
