# OpenDiff Architecture

## System Overview

```mermaid
flowchart TB
    subgraph External["External Services"]
        GH[("GitHub API")]
        OpenCode[("OpenCode")]
        Polar[("Polar Payments")]
        Resend[("Resend Email")]
        S3[("S3/R2 Storage")]
    end

    subgraph Auth["Authentication"]
        GitHub["GitHub OAuth"]
        Google["Google OAuth"]
        Microsoft["Microsoft OAuth"]
    end

    subgraph Frontend["Frontend Applications"]
        Website["website<br/><i>Marketing & Landing</i><br/>:5173"]
        App["app<br/><i>Console Dashboard</i><br/>:5174"]
    end

    subgraph Backend["Backend Services"]
        BFF["bff<br/><i>API Gateway</i><br/>:3001"]
        Agent["review-agent<br/><i>AI Code Reviewer</i><br/>:3000"]
    end

    subgraph SharedLibs["Shared Libraries"]
        Components["components<br/><i>UI Components</i>"]
        Shared["shared<br/><i>Business Logic</i>"]
        Prompts["prompts<br/><i>AI Prompt Templates</i>"]
        Assets["assets<br/><i>Static Assets</i>"]
    end

    subgraph Data["Data Layer"]
        DB[("PostgreSQL<br/>Prisma ORM")]
    end

    %% Frontend dependencies
    Website --> Components
    Website --> Shared
    Website --> Assets
    App --> Components
    App --> Shared
    App --> Assets
    Shared --> Components

    %% Frontend to Backend
    Website --> BFF
    App --> BFF

    %% Backend connections
    BFF --> DB
    BFF --> S3
    BFF --> Resend
    BFF --> Polar
    BFF --> Prompts
    Agent --> BFF
    Agent --> OpenCode
    Agent --> GH
    Agent --> Prompts

    %% Auth flow
    Auth --> BFF

    %% GitHub webhook
    GH -.->|Webhooks| Agent

    %% Styling
    classDef frontend fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef backend fill:#8b5cf6,stroke:#6d28d9,color:#fff
    classDef shared fill:#06b6d4,stroke:#0891b2,color:#fff
    classDef external fill:#6b7280,stroke:#4b5563,color:#fff
    classDef data fill:#f59e0b,stroke:#d97706,color:#fff
    classDef auth fill:#10b981,stroke:#059669,color:#fff

    class Website,App frontend
    class BFF,Agent backend
    class Components,Shared,Prompts,Assets shared
    class GH,OpenCode,Polar,Resend,S3 external
    class DB data
    class GitHub,Google,Microsoft auth
```

## Code Review Flow

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant Agent as Review Agent
    participant BFF as BFF API
    participant DB as PostgreSQL
    participant OpenCode as OpenCode

    GH->>Agent: Webhook (PR opened/updated)
    Agent->>BFF: Fetch repo settings & skills
    BFF->>DB: Query settings
    DB-->>BFF: Settings + custom rules
    BFF-->>Agent: Settings response

    Agent->>GH: Fetch PR diff & metadata
    GH-->>Agent: PR data

    Agent->>OpenCode: Analyze code with context
    OpenCode-->>Agent: Review comments

    Agent->>GH: Post review comments
    Agent->>BFF: Record review
    BFF->>DB: Store review & comments

    Note over Agent,GH: Optional: Auto-fix flow
    Agent->>GH: Push fix commit
    Agent->>GH: Resolve comment thread
```

## Package Dependencies

```mermaid
flowchart BT
    subgraph Apps["Applications"]
        App["app"]
        Website["website"]
    end

    subgraph Services["Services"]
        BFF["bff"]
        Agent["review-agent"]
    end

    subgraph Libraries["Shared Libraries"]
        Shared["shared"]
        Components["components"]
        Prompts["prompts"]
        Assets["assets"]
    end

    App --> Shared
    App --> Components
    App -.-> Assets
    Website --> Shared
    Website --> Components
    Website -.-> Assets
    Shared --> Components
    BFF --> Prompts
    Agent --> Prompts

    classDef app fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef service fill:#8b5cf6,stroke:#6d28d9,color:#fff
    classDef lib fill:#06b6d4,stroke:#0891b2,color:#fff

    class App,Website app
    class BFF,Agent service
    class Shared,Components,Prompts,Assets lib
```

## Data Model

```mermaid
erDiagram
    User ||--o{ OrganizationMember : "belongs to"
    User ||--o{ Skill : "creates"
    User ||--o{ AuditLog : "generates"

    Organization ||--o{ OrganizationMember : "has"
    Organization ||--o{ OrganizationInvite : "sends"
    Organization ||--o{ RepositorySettings : "configures"
    Organization ||--o{ Review : "owns"
    Organization ||--o{ Notification : "receives"

    RepositorySettings ||--o{ Review : "contains"

    Review ||--o{ ReviewComment : "has"
    ReviewComment ||--o| ReviewFix : "may have"

    Skill ||--o{ SkillResource : "includes"

    User {
        string id PK
        string email
        string name
        string githubId
        string googleId
        string microsoftId
    }

    Organization {
        string id PK
        string name
        string slug
        enum tier
        enum subscriptionStatus
        int seatCount
    }

    Review {
        string id PK
        int pullNumber
        string summary
        enum summaryStatus
    }

    Skill {
        string id PK
        string name
        string description
        string content
    }
```

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, React Router, React Query |
| **UI** | Radix UI, shadcn/ui, Framer Motion |
| **Backend** | Hono, Bun, Prisma |
| **Database** | PostgreSQL |
| **AI** | OpenCode SDK, Anthropic API |
| **Auth** | GitHub, Google, Microsoft OAuth |
| **Payments** | Polar, Stripe |
| **Infrastructure** | S3/R2, Resend |

## Ports

| Service | Port |
|---------|------|
| website | 5173 |
| app | 5174 |
| bff | 3001 |
| review-agent | 3000 |
