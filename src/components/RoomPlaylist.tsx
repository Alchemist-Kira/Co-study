"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { ListVideo, Plus, Trash2, Play, User } from "lucide-react";
import styles from "@/app/room/[id]/room.module.css";

interface PlaylistItem {
  id: string;
  room_id: string;
  video_url: string;
  title: string | null;
  thumbnail_url: string | null;
  added_by: string;
  created_at: string;
  profiles?: {
    username: string;
  } | null;
}

export default function RoomPlaylist({
  roomId,
  userId,
  currentVideoUrl,
  onPlayVideo,
}: {
  roomId: string;
  userId: string | undefined;
  currentVideoUrl: string | null;
  onPlayVideo: (url: string) => void;
}) {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [inputUrl, setInputUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const extractVideoId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
    return match ? match[1] : null;
  };

  const fetchPlaylist = async () => {
    if (!roomId) return;
    const { data, error } = await supabase
      .from("room_playlist")
      .select("*, profiles:profiles(username)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching playlist:", error);
    } else if (data) {
      setPlaylist(data as any[]);
    }
  };

  useEffect(() => {
    fetchPlaylist();

    // Subscribe to playlist updates
    const channel = supabase.channel(`playlist-db-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_playlist",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchPlaylist();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const fetchVideoMetadata = async (url: string) => {
    const defaultTitle = "YouTube Video";
    const videoId = extractVideoId(url);
    const defaultThumb = videoId
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : "";

    try {
      // Use noembed to fetch video title and metadata without API key
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title || defaultTitle,
          thumbnailUrl: data.thumbnail_url || defaultThumb,
        };
      }
    } catch (err) {
      console.error("Failed to fetch video metadata:", err);
    }

    return {
      title: defaultTitle,
      thumbnailUrl: defaultThumb,
    };
  };

  const addToPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim() || !userId || !roomId) return;

    const videoId = extractVideoId(inputUrl);
    if (!videoId) {
      alert("Invalid YouTube URL");
      return;
    }

    setIsLoading(true);
    const { title, thumbnailUrl } = await fetchVideoMetadata(inputUrl.trim());

    const { error } = await supabase.from("room_playlist").insert({
      room_id: roomId,
      video_url: inputUrl.trim(),
      title,
      thumbnail_url: thumbnailUrl,
      added_by: userId,
    });

    setIsLoading(false);
    if (error) {
      alert("Error adding video: " + error.message);
    } else {
      setInputUrl("");
    }
  };

  const deletePlaylistItem = async (id: string) => {
    const { error } = await supabase.from("room_playlist").delete().eq("id", id);
    if (error) {
      alert("Error removing item: " + error.message);
    }
  };

  const handlePlayNow = async (item: PlaylistItem) => {
    // 1. Trigger parent callback to update current room video URL
    onPlayVideo(item.video_url);

    // 2. Remove from playlist queue
    await deletePlaylistItem(item.id);
  };

  return (
    <div className={styles.chatContainer} style={{ maxHeight: "40vh" }}>
      <div className={styles.panelHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ListVideo size={16} style={{ color: "var(--accent-teal)" }} />
          <span>Video Queue ({playlist.length})</span>
        </div>
      </div>

      <div className={styles.messagesArea} style={{ padding: "0.75rem", gap: "0.5rem" }}>
        {playlist.length === 0 ? (
          <div style={{ margin: "auto", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>
            Queue is empty.<br />Add some YouTube links below!
          </div>
        ) : (
          playlist.map((item) => {
            const isCurrentlyPlaying = currentVideoUrl === item.video_url;
            return (
              <div
                key={item.id}
                className={styles.playlistItem}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  background: "var(--bg-main)",
                  padding: "0.5rem",
                  borderRadius: "var(--radius-md)",
                  border: isCurrentlyPlaying ? "1px solid var(--accent-teal)" : "1px solid transparent",
                  position: "relative",
                  alignItems: "center",
                }}
              >
                {item.thumbnail_url && (
                  <img
                    src={item.thumbnail_url}
                    alt={item.title || ""}
                    style={{
                      width: "60px",
                      height: "45px",
                      objectFit: "cover",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={item.title || ""}
                  >
                    {item.title}
                  </span>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <User size={10} /> {item.profiles?.username || "Unknown"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button
                    onClick={() => handlePlayNow(item)}
                    className={styles.backBtn}
                    style={{
                      padding: "0.3rem",
                      background: "rgba(20, 184, 166, 0.1)",
                      color: "var(--accent-teal)",
                      borderRadius: "var(--radius-sm)",
                    }}
                    title="Play Video"
                  >
                    <Play size={12} fill="var(--accent-teal)" />
                  </button>
                  <button
                    onClick={() => deletePlaylistItem(item.id)}
                    className={styles.backBtn}
                    style={{
                      padding: "0.3rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#EF4444",
                      borderRadius: "var(--radius-sm)",
                    }}
                    title="Remove from Queue"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={addToPlaylist} className={styles.chatInputArea} style={{ padding: "0.5rem" }}>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Queue YouTube link..."
          className={styles.chatInput}
          style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!inputUrl.trim() || isLoading}
          className={styles.sendBtn}
          style={{ width: "30px", height: "30px" }}
        >
          <Plus size={14} />
        </button>
      </form>
    </div>
  );
}
