"use client";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Users, Mic, MicOff, MessageSquare, ListVideo, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import styles from "./room.module.css";
import YouTubeSyncPlayer from "@/components/YouTubeSyncPlayer";
import VoiceChat from "@/components/VoiceChat";
import TextChat from "@/components/TextChat";
import RoomPlaylist from "@/components/RoomPlaylist";

export default function RoomPage() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [room, setRoom] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"social" | "queue">("social");
  
  // Fullscreen / Theater states
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isTheaterChatOpen, setIsTheaterChatOpen] = useState(false);
  const [isTheaterQueueOpen, setIsTheaterQueueOpen] = useState(false);

  // Dragging states for Theater Overlay Controls
  const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Reset coordinates when fullscreen is closed
  useEffect(() => {
    if (!isTheaterMode) {
      setOverlayPosition({ x: 0, y: 0 });
    }
  }, [isTheaterMode]);

  const handleDragStart = (clientX: number, clientY: number, target: HTMLElement) => {
    // Don't drag if user clicked buttons or interactive components inside the overlay
    if (target.closest("button") || target.closest("input") || target.closest("textarea")) return;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX - overlayPosition.x,
      y: clientY - overlayPosition.y
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    handleDragStart(e.clientX, e.clientY, e.target as HTMLElement);
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY, e.target as HTMLElement);
  };

  useEffect(() => {
    if (!isDragging) return;

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      setOverlayPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      setOverlayPosition({
        x: touch.clientX - dragStartRef.current.x,
        y: touch.clientY - dragStartRef.current.y
      });
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleDragEnd);

    return () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }

    if (user && id) {
      // Fetch room details initial load
      supabase
        .from("rooms")
        .select("*")
        .eq("id", id)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            alert("Room not found");
            router.push("/dashboard");
          } else {
            setRoom(data);
          }
        });

      // Subscribe to real-time changes on this room (e.g. video URL updates)
      const roomChannel = supabase.channel(`room-db-${id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${id}`,
          },
          (payload) => {
            setRoom(payload.new);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(roomChannel);
      };
    }
  }, [user, loading, id, router]);

  // Bind Native Fullscreen change listeners
  useEffect(() => {
    const handleFullscreenChange = () => {
      const elem = document.getElementById("video-section-root");
      const isCurrentlyFullscreen = document.fullscreenElement === elem ||
        (document as any).webkitFullscreenElement === elem ||
        (document as any).mozFullScreenElement === elem ||
        (document as any).msFullscreenElement === elem;

      if (elem && isCurrentlyFullscreen) {
        setIsTheaterMode(true);
      } else {
        setIsTheaterMode(false);
        setIsTheaterChatOpen(false);
        setIsTheaterQueueOpen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  // Bind global keyboard shortcut 'f' to toggle custom fullscreen
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function toggleFullscreen() {
    const elem = document.getElementById("video-section-root");
    if (!elem) return;

    const isCurrentlyFullscreen = document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement;

    if (!isCurrentlyFullscreen) {
      const requestMethod = elem.requestFullscreen ||
        (elem as any).webkitRequestFullscreen ||
        (elem as any).mozRequestFullScreen ||
        (elem as any).msRequestFullscreen;

      if (requestMethod) {
        requestMethod.call(elem).catch((err: any) => {
          console.error("Error attempting to enable full-screen mode:", err);
        });
      }
    } else {
      const exitMethod = document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;

      if (exitMethod) {
        exitMethod.call(document);
      }
    }
  }

  const handlePlayVideo = async (url: string) => {
    if (!room) return;

    const { error } = await supabase
      .from("rooms")
      .update({
        video_url: url,
        video_progress: 0,
      })
      .eq("id", room.id);

    if (error) {
      alert("Error playing queued video: " + error.message);
    }
  };

  if (!room) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0B0E14]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6366F1]"></div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${isTheaterMode ? styles.theaterActive : ""}`}>
      <div className={styles.mainArea}>
        <header className={styles.header}>
          <Link href="/dashboard" className={styles.backBtn}>
            <ArrowLeft size={18} />
            Back to Dashboard
          </Link>
          <div className={styles.roomInfo}>
            <span className={styles.roomName}>{room.name}</span>
            <span className={styles.roomMembers}>
              <Users size={14} /> Connected
            </span>
          </div>
          <div style={{ width: 100 }}></div> {/* Spacer for centering */}
        </header>

        <div className={styles.content}>
          <section id="video-section-root" className={styles.videoSection} style={{ position: "relative" }}>
            <YouTubeSyncPlayer
              room={room}
              userId={user?.id}
              isTheaterMode={isTheaterMode}
              onToggleTheaterMode={toggleFullscreen}
            />

            {/* Floating Overlay Controls for Theater Mode */}
            {isTheaterMode && (
              <div
                className={`${styles.theaterOverlay} ${isDragging ? styles.dragging : ""}`}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                style={{
                  transform: `translate(calc(-50% + ${overlayPosition.x}px), ${overlayPosition.y}px)`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsVoiceMuted(!isVoiceMuted)}
                  className={`${styles.theaterOverlayBtn} ${!isVoiceMuted ? styles.active : ""}`}
                  title={isVoiceMuted ? "Unmute Mic" : "Mute Mic"}
                >
                  {isVoiceMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsTheaterChatOpen(!isTheaterChatOpen);
                    setIsTheaterQueueOpen(false);
                  }}
                  className={`${styles.theaterOverlayBtn} ${isTheaterChatOpen ? styles.activePrimary : ""}`}
                  title="Toggle Chat Drawer"
                >
                  <MessageSquare size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsTheaterQueueOpen(!isTheaterQueueOpen);
                    setIsTheaterChatOpen(false);
                  }}
                  className={`${styles.theaterOverlayBtn} ${isTheaterQueueOpen ? styles.active : ""}`}
                  title="Toggle Video Queue"
                >
                  <ListVideo size={18} />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className={styles.theaterOverlayBtn}
                  title="Exit Full Screen"
                >
                  <Minimize2 size={18} />
                </button>
              </div>
            )}

            {/* Slide-in Drawer Panels (Overlaying on top of video) */}
            {isTheaterMode && isTheaterChatOpen && (
              <div className={styles.theaterDrawerRight}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent-primary)" }}>Room Live Chat</span>
                  <button
                    onClick={() => setIsTheaterChatOpen(false)}
                    style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}
                  >
                    Close
                  </button>
                </div>
                <TextChat roomId={room.id} userId={user?.id} />
              </div>
            )}

            {isTheaterMode && isTheaterQueueOpen && (
              <div className={styles.theaterDrawerLeft}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent-teal)" }}>Video Queue</span>
                  <button
                    onClick={() => setIsTheaterQueueOpen(false)}
                    style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}
                  >
                    Close
                  </button>
                </div>
                <RoomPlaylist
                  roomId={room.id}
                  userId={user?.id}
                  currentVideoUrl={room.video_url}
                  onPlayVideo={handlePlayVideo}
                />
              </div>
            )}
          </section>

          <aside className={styles.sidePanel}>
            {/* Sidebar Tab Header Controls */}
            <div className={styles.tabHeader}>
              <button
                onClick={() => setActiveTab("social")}
                className={`${styles.tabBtn} ${activeTab === "social" ? styles.activeTab : ""}`}
              >
                Social Chat
              </button>
              <button
                onClick={() => setActiveTab("queue")}
                className={`${styles.tabBtn} ${activeTab === "queue" ? styles.activeTab : ""}`}
              >
                Video Queue
              </button>
            </div>

            {/* VoiceChat is always mounted to maintain background WebRTC calling connections */}
            <div style={{ display: activeTab === "social" ? "block" : "none" }}>
              <VoiceChat
                roomId={room.id}
                userId={user?.id}
                externalMuted={isVoiceMuted}
                onMuteChange={setIsVoiceMuted}
              />
            </div>

            {activeTab === "social" ? (
              <TextChat roomId={room.id} userId={user?.id} />
            ) : (
              <RoomPlaylist
                roomId={room.id}
                userId={user?.id}
                currentVideoUrl={room.video_url}
                onPlayVideo={handlePlayVideo}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
