# Moca User Guide

> [🇯🇵 日本語版ユーザーガイドはこちら / Japanese User Guide](./USER_GUIDE-ja.md)

Moca is a powerful AI agent platform built on Amazon Bedrock. This guide introduces the main features and how to use them.

## Table of Contents

1. [Core Features](#core-features)
   - [Chat Interface](#chat-interface)
   - [AI Agent Management](#ai-agent-management)
   - [Tool Management](#tool-management)
   - [File Storage](#file-storage)
   - [Agent Sharing](#agent-sharing)
2. [Specialized Agent Examples](#specialized-agent-examples)
3. [Session Management](#session-management)

---

## Core Features

### Chat Interface

The main screen of Moca features a simple and intuitive chat interface.

![Main Screen](./assets/agentchat.geeawa.net_chat.png)

#### Key Features

- **Question & Consultation**: Ask questions and get advice from AI
- **Text Correction**: Receive proofreading and improvement suggestions for your writing
- **Web Search**: Get answers with up-to-date information from web searches
- **Create Summary**: Generate summaries of long texts
- **Brainstorming**: Get support for idea generation
- **Comparison & Analysis**: Compare and analyze multiple options

#### Sending Messages

1. Enter your question or message in the text box at the bottom of the screen
2. Press **Enter** to send, **Shift + Enter** for a new line
3. You can also click the send button (paper plane icon) in the bottom right

#### Model Selection

Select the AI model from the dropdown menu at the bottom of the screen.
- Default: **Claude Sonnet 4.5 (Anthropic)**

---

### AI Agent Management

Moca allows you to select, create, and customize AI agents specialized in various domains.

#### Selecting an Agent

![Agent Selection](./assets/agentchat.geeawa.net_chat_select_agent.png)

Click the icon in the left sidebar to open "Agent Selection" and view the list of available agents.

##### Available Agents

| Agent Name | Description |
|-----------|-------------|
| **General Assistant** | A basic agent that supports general questions and tasks |
| **Software Developer** | A software development agent with GitHub integration |
| **Code Review Agent** | An agent specialized in code review and programming assistance |
| **Data Analyst Agent** | An agent specialized in data analysis and statistical processing |
| **PowerPoint Creator** | An agent specialized in creating presentation materials |
| **Web Deep Researcher** | An agent specialized in deep research and information gathering |
| **Physicist** | An agent specialized in theoretical and computational physics |
| **Image Creator** | An image generation agent using Amazon Nova Canvas |
| **Slideshow Video Creator** | A video creation agent with Japanese subtitles and narration |
| **Kamishibai Master** | An agent specialized in creating Japanese picture stories (Kamishibai) |
| **Knowledge Base Search Agent** | A semantic search agent using Amazon Bedrock |

#### Creating a New Agent

1. Click the "**+ Create New Agent**" button on the agent selection screen
2. Set the agent name, description, and icon
3. Select the required tools
4. Save to complete

---

### Tool Management

Extend agent capabilities by adding various tools.

![Tool Selection](./assets/agentchat.geeawa.net_chat_select_tool.png)

#### Adding/Editing Tools

1. Open the agent menu (...) on the agent selection screen
2. Select "Edit"
3. Select the "Tools" tab
4. Choose the required tools from the available tools list
5. Click "Save"

#### Main Available Tools

| Tool Name | Description |
|----------|-------------|
| **execute_command** | Execute shell commands. Used for file operations, information gathering, and development task automation |
| **tavily_search** | High-quality web search using Tavily API. Get latest information and news |
| **tavily_extract** | Extract content from specified URLs. Get structured text from web pages |
| **file_editor** | File read/write and edit operations |
| **nova_canvas** | Image generation using Amazon Nova Canvas |
| **s3_list_files** | Get file list from S3 storage |

---

### File Storage

A cloud storage feature for uploading and managing files.

![File Storage](./assets/agentchat.geeawa.net_chat_file_storage.png)

#### Key Features

- **File Upload**: Upload files up to 5MB
- **Folder Creation**: Create folders to organize files
- **File Management**: Download and delete uploaded files

#### How to Use

1. Click the "File Management" icon in the left sidebar
2. The "File Storage" panel will open
3. Click **Upload** button to upload files
4. Click **New Folder** button to create a new folder
5. Use the icons next to file names to download or delete files

**Note**: The file size limit is 5MB.

---

### Agent Sharing

Search and use agents created within your organization.

![Agent Search](./assets/agentchat.geeawa.net_chat_share_agent.png)

#### How to Use

1. Click the "Search" icon in the left sidebar
2. The "Search Agents" page will open
3. Enter keywords in the search box to search
4. Click on an agent to view details
5. Click "Add to My Agents" to add it to your agent list

---

## Specialized Agent Examples

### Physicist (Physics Agent)

An agent specialized in theoretical and computational physics. Capable of simulating complex physical phenomena and comparative analysis.

![Physicist](./assets/agentchat.geeawa.net_chat_physicist.png)

#### Capabilities

- Physical phenomenon simulation
- Comparative analysis of damped oscillations
- Visualization with graphs
- Comparison of theoretical and measured values

The screenshot above shows a comparative analysis of three damping patterns (Underdamped, Critically Damped, and Overdamped).

---

### Slideshow Video Creator

An agent that automatically generates videos with Japanese subtitles and narration from PDF files.

![PDF to Video](./assets/agentchat.geeawa.net_chat_pdf-to-video.png)

#### Processing Flow

1. Upload a PDF file
2. AI converts each PDF page to images
3. Generate Japanese subtitles and narration
4. Output as a video

![Video Result](./assets/agentchat.geeawa.net_chat_pdf-to-video-result.png)

#### Usage Example

```
Please convert a PDF (PowerPoint export) to a narrated video:
PDF file: /20251019 Context engineering.pdf
```

The agent automatically performs the following:
- Convert PDF pages to images
- Generate subtitles
- Generate narration audio
- Combine and output the video

---

### Other Specialized Agents

#### Software Developer
- Development support with GitHub integration
- Code generation, editing, and review
- Repository operations

#### Data Analyst Agent
- Data analysis and statistical processing
- Create graphs and charts
- Data visualization

#### PowerPoint Creator
- Create presentation materials
- Propose slide designs
- Optimize content structure

#### Web Deep Researcher
- Deep research and information gathering
- Integrate information from multiple sources
- Create reports

---

## Session Management

Manage chat sessions (conversation history).

### Key Features

- **Session List**: Display past conversation history
- **Session Switching**: Return to previous conversations and continue
- **Session Deletion**: Delete unnecessary conversation history
- **New Session**: Start a new conversation

### How to Use

1. Click the "Home" icon at the top of the left sidebar
2. The session list will be displayed
3. Click on a session name to switch
4. Use the "..." menu for deletion and other operations

---

## Keyboard Shortcuts

Keyboard shortcuts for efficient work.

| Key | Action |
|-----|--------|
| **Enter** | Send message |
| **Shift + Enter** | New line |
| **/** | File path specification mode |

---

## Other Features

### User Settings

- Edit profile information
- Language settings (Japanese/English)
- Theme settings

### Memory Management

Agents remember conversation context for more natural dialogue.
- Short-term memory: Conversation content within the session
- Long-term memory: User preferences and past information

