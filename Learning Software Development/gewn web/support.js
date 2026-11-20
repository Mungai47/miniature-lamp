const loginView = document.querySelector("#login-view");
const inboxView = document.querySelector("#inbox-view");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const signOutButton = document.querySelector("#sign-out");
const conversationList = document.querySelector("#conversation-list");
const conversationCount = document.querySelector("#conversation-count");
const inboxError = document.querySelector("#inbox-error");
const threadEmpty = document.querySelector("#thread-empty");
const threadContent = document.querySelector("#thread-content");
const threadName = document.querySelector("#thread-name");
const threadEmail = document.querySelector("#thread-email");
const threadMessages = document.querySelector("#thread-messages");
const threadError = document.querySelector("#thread-error");
const resolveButton = document.querySelector("#resolve-button");
const replyForm = document.querySelector("#agent-reply-form");
const sessionStorageKey = "northstar-agent-token";
let agentToken = window.sessionStorage.getItem(sessionStorageKey);
let conversations = [];
let selectedConversationId = null;
let selectedConversationStatus = "open";
let messageCursor = 0;
let inboxPollTimer = null;
let inboxPollInFlight = false;
let messagePollInFlight = false;

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (agentToken) {
    headers.set("Authorization", `Bearer ${agentToken}`);
  }
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && agentToken) {
      signOut();
    }
    throw new Error(result.error || "The request could not be completed.");
  }
  return result;
}

function showInbox() {
  loginView.hidden = true;
  inboxView.hidden = false;
  signOutButton.hidden = false;
  window.clearInterval(inboxPollTimer);
  loadConversations();
  inboxPollTimer = window.setInterval(loadConversations, 2500);
}

function signOut() {
  window.clearInterval(inboxPollTimer);
  agentToken = null;
  selectedConversationId = null;
  window.sessionStorage.removeItem(sessionStorageKey);
  loginView.hidden = false;
  inboxView.hidden = true;
  signOutButton.hidden = true;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function renderConversations() {
  conversationCount.textContent = String(conversations.filter((item) => item.status === "open").length);
  conversationList.replaceChildren();

  if (conversations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "No conversations yet. New customer messages will appear here.";
    conversationList.append(empty);
    return;
  }

  for (const conversation of conversations) {
    const button = document.createElement("button");
    button.className = `conversation-item${conversation.id === selectedConversationId ? " is-selected" : ""}`;
    button.type = "button";
    button.addEventListener("click", () => selectConversation(conversation.id));

    const top = document.createElement("span");
    top.className = "conversation-item-top";
    const name = document.createElement("strong");
    name.textContent = conversation.name;
    const time = document.createElement("time");
    time.dateTime = conversation.updatedAt;
    time.textContent = formatTime(conversation.updatedAt);
    top.append(name, time);

    const preview = document.createElement("span");
    preview.className = "conversation-item-preview";
    preview.textContent = conversation.lastMessage ? conversation.lastMessage.content : "No messages";

    const bottom = document.createElement("span");
    bottom.className = "conversation-item-bottom";
    const email = document.createElement("span");
    email.className = "conversation-email";
    email.textContent = conversation.email;
    const status = document.createElement("span");
    status.className = `status-pill${conversation.status === "resolved" ? " is-resolved" : ""}`;
    status.textContent = conversation.status;
    bottom.append(email, status);
    button.append(top, preview, bottom);
    conversationList.append(button);
  }
}

async function loadConversations() {
  if (!agentToken || inboxPollInFlight) {
    return;
  }

  inboxPollInFlight = true;
  try {
    const result = await apiRequest("/api/agent/conversations");
    conversations = result.conversations;
    renderConversations();
    inboxError.textContent = "";
    if (selectedConversationId && !messagePollInFlight) {
      await loadMessages();
    }
  } catch (error) {
    inboxError.textContent = error.message || "Could not load conversations.";
  } finally {
    inboxPollInFlight = false;
  }
}

function renderMessage(message) {
  const article = document.createElement("article");
  article.className = `thread-message thread-message-${message.sender === "agent" ? "agent" : "customer"}`;

  const header = document.createElement("div");
  header.className = "thread-message-header";
  const sender = document.createElement("strong");
  sender.textContent = message.sender === "agent" ? "Customer care" : "Customer";
  const time = document.createElement("time");
  time.dateTime = message.createdAt;
  time.textContent = formatTime(message.createdAt);
  header.append(sender, time);

  const content = document.createElement("p");
  content.textContent = message.content;
  article.append(header, content);
  threadMessages.append(article);
  threadMessages.scrollTop = threadMessages.scrollHeight;
  messageCursor = Math.max(messageCursor, Number(message.cursor) || 0);
}

async function selectConversation(id) {
  selectedConversationId = id;
  messageCursor = 0;
  threadMessages.replaceChildren();
  threadError.textContent = "";
  threadEmpty.hidden = true;
  threadContent.hidden = false;
  await loadMessages();
  renderConversations();
}

async function loadMessages() {
  if (!selectedConversationId || !agentToken || messagePollInFlight) {
    return;
  }

  messagePollInFlight = true;
  try {
    const result = await apiRequest(
      `/api/agent/conversations/${encodeURIComponent(selectedConversationId)}/messages?after=${messageCursor}`
    );
    if (result.conversation.id !== selectedConversationId) {
      return;
    }
    const conversation = result.conversation;
    selectedConversationStatus = conversation.status;
    threadName.textContent = conversation.name;
    threadEmail.textContent = conversation.email;
    threadEmail.href = `mailto:${conversation.email}`;
    resolveButton.textContent = conversation.status === "resolved" ? "Reopen" : "Resolve";
    replyForm.hidden = conversation.status === "resolved";
    result.messages.forEach(renderMessage);
    threadError.textContent = "";
  } catch (error) {
    threadError.textContent = error.message || "Could not load this conversation.";
  } finally {
    messagePollInFlight = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  loginError.textContent = "";
  try {
    const result = await apiRequest("/api/agent/login", {
      method: "POST",
      body: JSON.stringify({ password: loginForm.elements.password.value }),
    });
    agentToken = result.token;
    window.sessionStorage.setItem(sessionStorageKey, agentToken);
    loginForm.reset();
    showInbox();
  } catch (error) {
    loginError.textContent = error.message || "Could not sign in.";
  } finally {
    submitButton.disabled = false;
  }
});

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = replyForm.elements.content;
  const submitButton = replyForm.querySelector('button[type="submit"]');
  const content = input.value.trim();
  if (!content || !selectedConversationId) {
    return;
  }

  submitButton.disabled = true;
  threadError.textContent = "";
  try {
    const result = await apiRequest(
      `/api/agent/conversations/${encodeURIComponent(selectedConversationId)}/messages`,
      { method: "POST", body: JSON.stringify({ content }) }
    );
    renderMessage(result.message);
    input.value = "";
    await loadConversations();
  } catch (error) {
    threadError.textContent = error.message || "Your reply could not be sent.";
  } finally {
    submitButton.disabled = false;
  }
});

resolveButton.addEventListener("click", async () => {
  if (!selectedConversationId) {
    return;
  }

  resolveButton.disabled = true;
  threadError.textContent = "";
  const action = selectedConversationStatus === "resolved" ? "reopen" : "resolve";
  try {
    await apiRequest(
      `/api/agent/conversations/${encodeURIComponent(selectedConversationId)}/${action}`,
      { method: "POST", body: "{}" }
    );
    await loadMessages();
    await loadConversations();
  } catch (error) {
    threadError.textContent = error.message || "The conversation status could not be changed.";
  } finally {
    resolveButton.disabled = false;
  }
});

signOutButton.addEventListener("click", signOut);

if (agentToken) {
  showInbox();
}
