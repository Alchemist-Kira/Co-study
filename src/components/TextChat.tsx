"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Send, MessageSquare } from "lucide-react";
import styles from "@/app/room/[id]/room.module.css";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export default function TextChat({ roomId, userId }: { roomId: string; userId: string | undefined }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [username, setUsername] = useState("Unknown");
  const channelRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userId) {
      supabase.from("profiles").select("username").eq("id", userId).single().then(({ data }) => {
        if (data) setUsername(data.username);
      });
    }
  }, [userId]);

  useEffect(() => {
    if (!roomId || !userId) return;

    // Use a dedicated channel for chat broadcast
    const topic = `chat-${roomId}`;
    
    // Clean up strict mode duplicates
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${topic}`);
    if (existing) {
      supabase.removeChannel(existing).then();
    }

    const channel = supabase.channel(topic);
    
    channel.on("broadcast", { event: "new-message" }, ({ payload }) => {
      setMessages(prev => [...prev, payload]);
    }).subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, userId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !channelRef.current || !userId) return;

    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      senderId: userId,
      senderName: username,
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    channelRef.current.send({
      type: "broadcast",
      event: "new-message",
      payload: newMessage,
    });

    // Add locally immediately
    setMessages(prev => [...prev, newMessage]);
    setInputText("");
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={16} style={{ color: 'var(--accent-primary)' }} />
          <span>Live Chat</span>
        </div>
      </div>
      
      <div className={styles.messagesArea}>
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
            No messages yet.<br/>Say hello!
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === userId;
            return (
              <div key={msg.id} className={`${styles.message} ${isOwn ? styles.own : ''}`}>
                <div className={styles.messageHeader}>
                  <span className={styles.messageAuthor}>{isOwn ? 'You' : msg.senderName}</span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className={styles.messageText}>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className={styles.chatInputArea}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className={styles.chatInput}
          onFocus={(e) => {
            // Prevent PTT trigger when focusing chat input
            e.stopPropagation();
          }}
        />
        <button type="submit" disabled={!inputText.trim()} className={styles.sendBtn}>
          <Send size={16} style={{ marginLeft: '-2px' }} />
        </button>
      </form>
    </div>
  );
}
