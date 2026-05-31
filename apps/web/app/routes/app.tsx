import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { redirect, useLoaderData } from "react-router"
import type { ChatMessage, ConversationSummary, Event } from "@symbiote/types"
import type { Route } from "./+types/app"
import { BotIcon, LogOutIcon, MessageSquareIcon, PlusIcon, SendIcon } from "lucide-react"
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "~/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "~/components/ai-elements/message"
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "~/components/ai-elements/prompt-input"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "~/components/ai-elements/reasoning"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "~/components/ai-elements/tool"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "~/components/ui/sidebar"
import { Skeleton } from "~/components/ui/skeleton"
import { authClient } from "../lib/auth-client"
import { getCurrentSession } from "../lib/auth.server"
import { useSCDP } from "../lib/scdp"
import { cn } from "~/lib/utils"

type ChatEntry =
  | {
      id: string
      kind: "message"
      role: "user" | "assistant"
      content: string
      reasoning?: string
    }
  | {
      id: string
      kind: "tool"
      callId: string
      name: string
      input: unknown
      output?: unknown
      errorText?: string
    }

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Symbiote" },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request)

  if (!session) {
    throw redirect("/auth/sign-in")
  }

  return { session }
}

function isRoleMessage(message: ChatMessage): message is Extract<ChatMessage, { role: "user" | "assistant" | "system" | "developer" }> {
  return "role" in message
}

function toChatEntries(messages: ChatMessage[]): ChatEntry[] {
  return messages.flatMap<ChatEntry>((message, index) => {
    if (isRoleMessage(message)) {
      if (message.role !== "user" && message.role !== "assistant") {
        return []
      }

      return [{
        id: `message-${index}`,
        kind: "message" as const,
        role: message.role,
        content: message.content,
        reasoning: message.reasoning,
      }]
    }

    let output: unknown = message.output
    let errorText: string | undefined

    try {
      const parsedOutput = JSON.parse(message.output)
      output = parsedOutput
      if (parsedOutput?.name === "function.error") {
        errorText = String(parsedOutput.data?.error ?? "Tool failed")
      }
    } catch {
      output = message.output
    }

    return [{
      id: `tool-${message.call_id}-${index}`,
      kind: "tool" as const,
      callId: message.call_id,
      name: "Tool result",
      input: {},
      output,
      errorText,
    }]
  })
}

function formatConversationDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function parseToolArguments(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

export default function Workspace() {
  const { session } = useLoaderData<typeof loader>()
  const scdp = useSCDP()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeConversationIdRef = useRef<string | null>(null)
  const pendingToolCallIdRef = useRef<string | null>(null)
  const conversationBottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    conversationBottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    })
  }, [entries, streaming])

  useEffect(() => {
    return scdp.subscribe((event) => {
      if (event.name === "symbiote.error") {
        setError(event.data.error)
        setStreaming(false)
        return
      }

      if (event.name === "conversations.list" && event.data?.conversations) {
        setConversations(event.data.conversations)
        return
      }

      if (event.name === "conversation.fetch" && event.data.conversation) {
        setActiveConversationId(event.data.conversation.id)
        setEntries(toChatEntries(event.data.conversation.messages))
        setLoadingConversationId(null)
        setError(null)
        return
      }

      if (event.name === "llm.function_call") {
        pendingToolCallIdRef.current = event.data.call_id
        setEntries((current) => [
          ...current,
          {
            id: `tool-${event.data.call_id}`,
            kind: "tool",
            callId: event.data.call_id,
            name: event.data.name,
            input: parseToolArguments(event.data.arguments),
          },
        ])
        return
      }

      if (event.name === "function.ok" || event.name === "function.error") {
        const callId = pendingToolCallIdRef.current

        setEntries((current) => {
          let index = callId
            ? current.findIndex((entry) => entry.kind === "tool" && entry.callId === callId)
            : -1

          if (index < 0) {
            for (let entryIndex = current.length - 1; entryIndex >= 0; entryIndex -= 1) {
              const entry = current[entryIndex]
              if (entry.kind === "tool" && !entry.output && !entry.errorText) {
                index = entryIndex
                break
              }
            }
          }

          if (index < 0) {
            return current
          }

          return current.map((entry, entryIndex) => {
            if (entryIndex !== index || entry.kind !== "tool") {
              return entry
            }

            return {
              ...entry,
              output: event.data,
              errorText: event.name === "function.error" ? String(event.data.error ?? "Tool failed") : undefined,
            }
          })
        })
        return
      }

      if (event.name === "llm.think") {
        setStreaming(true)
        setEntries((current) => {
          const lastEntry = current.at(-1)

          if (lastEntry?.kind === "message" && lastEntry.role === "assistant") {
            return current.map((entry, index) => (
              index === current.length - 1 && entry.kind === "message"
                ? { ...entry, reasoning: `${entry.reasoning ?? ""}${event.data.delta}` }
                : entry
            ))
          }

          return [
            ...current,
            {
              id: `assistant-${event.data.item_id}`,
              kind: "message",
              role: "assistant",
              content: "",
              reasoning: event.data.delta,
            },
          ]
        })
        return
      }

      if (event.name === "llm.response") {
        setStreaming(true)
        setEntries((current) => {
          const lastEntry = current.at(-1)

          if (lastEntry?.kind === "message" && lastEntry.role === "assistant") {
            return current.map((entry, index) => (
              index === current.length - 1 && entry.kind === "message"
                ? { ...entry, content: entry.content + event.data.delta }
                : entry
            ))
          }

          return [
            ...current,
            {
              id: `assistant-${event.data.item_id}`,
              kind: "message",
              role: "assistant",
              content: event.data.delta,
            },
          ]
        })
        return
      }

      if (event.name === "llm.finish") {
        setStreaming(false)
      }
    })
  }, [scdp])

  const activeConversation = useMemo(() => (
    conversations.find((conversation) => conversation.id === activeConversationId) ?? null
  ), [activeConversationId, conversations])

  const switchConversation = useCallback(async (id: string) => {
    if (streaming) {
      return
    }

    setLoadingConversationId(id)
    setError(null)
    await scdp.send({ name: "conversation.switch", data: { id } })
    await scdp.send({ name: "conversation.fetch", data: { id } })
  }, [scdp, streaming])

  const createNewConversation = useCallback(async () => {
    if (streaming) {
      return
    }

    const id = crypto.randomUUID()
    setActiveConversationId(id)
    setEntries([])
    setError(null)
    await scdp.send({ name: "conversation.switch", data: { id } })
    await scdp.send({ name: "conversations.list" })
  }, [scdp, streaming])

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim()
    if (!content || streaming) {
      return
    }

    let conversationId = activeConversationIdRef.current

    if (!conversationId) {
      conversationId = crypto.randomUUID()
      activeConversationIdRef.current = conversationId
      setActiveConversationId(conversationId)
      await scdp.send({ name: "conversation.switch", data: { id: conversationId } })
    }

    const userMessage: ChatEntry = {
      id: `user-${Date.now()}`,
      kind: "message",
      role: "user",
      content,
    }

    setEntries((current) => [...current, userMessage])
    setStreaming(true)
    setError(null)
    await scdp.send({
      name: "llm.request",
      data: {
        messages: [{ role: "user", content }],
      },
    })
  }, [scdp, streaming])

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)

    try {
      await authClient.signOut()
      window.location.assign("/auth/sign-in")
    } finally {
      setSigningOut(false)
    }
  }, [])

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 px-2">
              <BotIcon data-icon="inline-start" />
              <span className="truncate font-medium">Symbiote</span>
            </div>
            <Button aria-label="New chat" onClick={createNewConversation} size="icon-sm" type="button" variant="ghost">
              <PlusIcon />
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {scdp.status === "connecting" && !conversations.length ? (
                  <>
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                  </>
                ) : conversations.length ? (
                  conversations.map((conversation) => (
                    <SidebarMenuItem key={conversation.id}>
                      <SidebarMenuButton
                        isActive={conversation.id === activeConversationId}
                        onClick={() => void switchConversation(conversation.id)}
                        tooltip={conversation.title}
                      >
                        <MessageSquareIcon />
                        <span>{conversation.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatConversationDate(conversation.updatedAt)}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                ) : (
                  <li className="px-2 py-6 text-center text-muted-foreground text-sm">No chats yet</li>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Separator />
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">{session.user.name}</div>
              <div className="truncate text-muted-foreground text-xs">{session.user.email}</div>
            </div>
            <Button disabled={signingOut} onClick={handleSignOut} size="icon-sm" type="button" variant="ghost">
              <LogOutIcon />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger />
            <div className="min-w-0">
              <h1 className="truncate font-medium text-sm">{activeConversation?.title ?? "New chat"}</h1>
              <p className="text-muted-foreground text-xs">
                {scdp.status === "open" ? "Connected" : "Connecting"}
              </p>
            </div>
          </div>
          <Badge className="shrink-0" variant={scdp.status === "open" ? "secondary" : "outline"}>
            {streaming ? "Thinking" : scdp.status}
          </Badge>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {loadingConversationId ? (
            <div className="flex flex-1 flex-col gap-4 p-6">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="ml-auto h-16 w-2/3" />
              <Skeleton className="h-24 w-4/5" />
            </div>
          ) : (
            <Conversation className="min-h-0">
              <ConversationContent className="mx-auto w-full max-w-3xl">
                {!entries.length ? (
                  <ConversationEmptyState
                    description="Create a new chat or pick a previous one from the sidebar."
                    icon={<MessageSquareIcon />}
                    title="Ready when you are"
                  />
                ) : (
                  entries.map((entry) => (
                    entry.kind === "message" ? (
                      <Message from={entry.role} key={entry.id}>
                        <MessageContent>
                          {entry.role === "assistant" ? (
                            <div className="flex flex-col gap-3">
                              {entry.reasoning && (
                                <Reasoning
                                  className="rounded-md border bg-muted/30 p-3"
                                  isStreaming={streaming && !entry.content}
                                >
                                  <ReasoningTrigger />
                                  <ReasoningContent>{entry.reasoning}</ReasoningContent>
                                </Reasoning>
                              )}
                              {entry.content ? (
                                <MessageResponse>{entry.content}</MessageResponse>
                              ) : (
                                <span className="text-muted-foreground">Thinking...</span>
                              )}
                            </div>
                          ) : (
                            entry.content
                          )}
                        </MessageContent>
                      </Message>
                    ) : (
                      <Tool className="max-w-full" defaultOpen={!!entry.errorText || !entry.output} key={entry.id}>
                        <ToolHeader
                          state={entry.errorText ? "output-error" : entry.output ? "output-available" : "input-available"}
                          toolName={entry.name}
                          type="dynamic-tool"
                        />
                        <ToolContent>
                          <ToolInput input={entry.input} />
                          <ToolOutput errorText={entry.errorText} output={entry.output} />
                        </ToolContent>
                      </Tool>
                    )
                  ))
                )}
                <div ref={conversationBottomRef} />
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          )}

          <div className="border-t bg-background p-4">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
              {(error || scdp.error) && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {error ?? scdp.error}
                </div>
              )}
              <PromptInput
                className={cn(streaming && "opacity-80")}
                onSubmit={(message) => sendMessage(message.text)}
              >
                <PromptInputBody>
                  <PromptInputTextarea disabled={streaming} placeholder="Message Symbiote" />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools />
                  <PromptInputSubmit disabled={streaming || scdp.status !== "open"} status={streaming ? "streaming" : "ready"}>
                    {!streaming && <SendIcon />}
                  </PromptInputSubmit>
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
