import { Agent, AgentStatus } from "./Types";
import { AgentStore } from "./State/AgentStore";

type MessageEntry = ["user" | "agent", string];

interface TopicSeed {
  title: string;
  messages: MessageEntry[];
}

interface AgentSeed {
  agent: Agent;
  topics: TopicSeed[];
  activeTopicIndex: number;
}

const AGENT_SEEDS: AgentSeed[] = [
  {
    agent: {
      id: "agent-1",
      name: "Forge",
      description: "Feature implementation and refactoring",
      status: AgentStatus.Idle,
      currentTaskId: null,
    },
    activeTopicIndex: 0,
    topics: [
      {
        title: "Auth Refactor",
        messages: [
          ["user", "Status?"],
          ["agent", "Ready."],
          ["user", "Move token refresh out of the API client."],
          [
            "agent",
            "Done. I extracted it into TokenManager.ts and the client now calls tokenManager.getValidToken() before each request. Concurrent refreshes are deduplicated with a shared promise, so a burst of 401s only triggers one refresh call.",
          ],
          ["user", "Tests?"],
          ["agent", "42 pass, 1 fails: auth.spec.ts line 88."],
          ["user", "Why?"],
          [
            "agent",
            "The test mocks the old refresh path on the client. It needs to stub TokenManager instead. It's a test issue, not a behavior regression.",
          ],
          ["user", "Fix it."],
          ["agent", "Updated. All 43 pass."],
        ],
      },
      {
        title: "Dark Mode Toggle",
        messages: [
          ["user", "Add a dark mode toggle to settings."],
          [
            "agent",
            "Added a Switch in SettingsPanel bound to ThemeStore.isDark. The choice persists in local storage and defaults to the system setting on first launch.",
          ],
          ["user", "Colors?"],
          ["agent", "Pulled from theme tokens. No hardcoded values."],
          ["user", "Ship it."],
          ["agent", "Committed to feature/dark-mode."],
        ],
      },
      {
        title: "Lint Cleanup",
        messages: [
          ["user", "How many lint warnings?"],
          [
            "agent",
            "37 total. 21 are unused imports, 9 are implicit any, and 7 are missing return types. All 37 are auto-fixable except the implicit any cases in legacy/parser.ts.",
          ],
          ["user", "Fix the auto-fixable ones."],
          ["agent", "Done. 9 remain."],
        ],
      },
    ],
  },
  {
    agent: {
      id: "agent-2",
      name: "Sentinel",
      description: "Code review and bug triage",
      status: AgentStatus.Idle,
      currentTaskId: null,
    },
    activeTopicIndex: 0,
    topics: [
      {
        title: "PR #482 Review",
        messages: [
          ["user", "Review PR 482."],
          [
            "agent",
            "Reviewed. The caching change looks good overall, but I found two issues. First, CacheService.get() never checks TTL expiry, so stale entries are returned forever. Second, the eviction loop mutates the map while iterating over it.",
          ],
          ["user", "Severity?"],
          ["agent", "Stale entries: high. Eviction loop: medium."],
          ["user", "Suggest fixes."],
          [
            "agent",
            "For the TTL, compare Date.now() to entry.expiresAt in get() and delete on miss. For eviction, collect keys first, then delete after the loop. I can push both as a patch.",
          ],
          ["user", "Push it."],
          ["agent", "Pushed to the PR branch."],
        ],
      },
      {
        title: "Crash on Launch",
        messages: [
          ["user", "Users report a crash on launch."],
          [
            "agent",
            "Found it in the crash logs. 94% of reports are a null reference in ConfigLoader.load() when the config file is missing. It started in v2.3.1 when the default config fallback was removed.",
          ],
          ["user", "Fix?"],
          ["agent", "Restore the fallback and add a null check."],
          ["user", "Do it."],
          ["agent", "Fixed, with a regression test."],
        ],
      },
      {
        title: "Flaky Tests",
        messages: [
          ["user", "Which tests are flaky?"],
          [
            "agent",
            "3 in the last 50 CI runs: upload.spec.ts (timing race, failed 8 times), cache.spec.ts (shared state, 5 times), and ws.spec.ts (port collision, 4 times).",
          ],
          ["user", "Start with upload."],
          ["agent", "On it."],
        ],
      },
    ],
  },
];

export function getMockAgents(): Agent[] {
  return AGENT_SEEDS.map((s) => s.agent);
}

export function seedMockData(store: AgentStore): void {
  store.setAgents(getMockAgents());

  for (const seed of AGENT_SEEDS) {
    const agentId = seed.agent.id;
    const createdTopics = seed.topics.map((t) =>
      store.addTopic(agentId, t.title)!,
    );

    for (let i = 0; i < seed.topics.length; i++) {
      store.selectTopic(agentId, createdTopics[i].id);
      for (const [sender, content] of seed.topics[i].messages) {
        store.addMessage(agentId, sender, content);
      }
    }

    store.selectTopic(agentId, createdTopics[seed.activeTopicIndex].id);
  }
}
