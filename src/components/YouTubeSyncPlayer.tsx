"use client";

import { useEffect, useState, useRef } from "react";
import YouTube, { YouTubeProps, YouTubePlayer } from "react-youtube";
import { supabase } from "@/lib/supabase";
import styles from "@/app/room/[id]/room.module.css";
import { Play, Pause, FastForward, Rewind, Users, Eye, EyeOff, Smile, Maximize } from "lucide-react";

interface Watcher {
  userId: string;
  username: string;
  progress: number;
  duration: number;
  isPlaying: boolean;
  isSynced: boolean;
  updated_at: number;
}

interface Reaction {
  id: string;
  emoji: string;
  xOffset: number;
  xOffsetEnd: number;
}

export default function YouTubeSyncPlayer({
  room,
  userId,
  isTheaterMode,
  onToggleTheaterMode,
}: {
  room: any;
  userId: string | undefined;
  isTheaterMode: boolean;
  onToggleTheaterMode: () => void;
}) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState("");
  const [username, setUsername] = useState("Watcher");
  const [isSynced, setIsSynced] = useState(true);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [manualTime, setManualTime] = useState("");
  const playerRef = useRef<YouTubePlayer | null>(null);
  const channelRef = useRef<any>(null);
  const isSyncingRef = useRef(false); // prevent infinite loops
  const isSyncedRef = useRef(isSynced);

  // Keep ref up to date to access inside event listeners
  useEffect(() => {
    isSyncedRef.current = isSynced;
  }, [isSynced]);

  // Extract YouTube ID
  const extractVideoId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
    return match ? match[1] : null;
  };

  // Fetch current user username
  useEffect(() => {
    if (userId) {
      supabase.from("profiles").select("username").eq("id", userId).single().then(({ data }) => {
        if (data) setUsername(data.username);
      });
    }
  }, [userId]);

  const fetchSavedProgress = async (vidUrl: string) => {
    if (!userId || !room.id) return 0;
    const { data } = await supabase
      .from("room_user_progress")
      .select("progress")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .eq("video_url", vidUrl)
      .maybeSingle();
    
    return data ? Number(data.progress) : 0;
  };

  const saveDbProgress = async (time: number) => {
    if (!userId || !room.id || !room.video_url || time <= 0) return;
    await supabase.from("room_user_progress").upsert({
      room_id: room.id,
      user_id: userId,
      video_url: room.video_url,
      progress: time,
      updated_at: new Date().toISOString()
    });
  };

  useEffect(() => {
    if (room.video_url) {
      setVideoId(extractVideoId(room.video_url));
    }

    if (!room.id || !userId) return;

    // Build the room channel with presence configurations
    const channel = supabase.channel(`room-${room.id}`, {
      config: {
        presence: {
          key: userId,
        }
      }
    });
    
    channel
      .on("broadcast", { event: "sync-video" }, ({ payload }) => {
        // Ignore events if we aren't in sync mode
        if (!isSyncedRef.current) return;
        
        if (payload.senderId === userId || !playerRef.current) return;
        
        isSyncingRef.current = true;
        
        const player = playerRef.current;
        const currentId = player.getVideoData().video_id;
        
        if (payload.videoId && payload.videoId !== currentId) {
          setVideoId(payload.videoId);
        }
        
        if (payload.action === "play") {
          const currentTime = player.getCurrentTime();
          if (Math.abs(currentTime - payload.time) > 2.5) {
            player.seekTo(payload.time, true);
          }
          player.playVideo();
        } else if (payload.action === "pause") {
          player.pauseVideo();
          player.seekTo(payload.time, true);
        }
        
        setTimeout(() => {
          isSyncingRef.current = false;
        }, 500);
      })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        triggerReactionLocally(payload.emoji, payload.xOffset, payload.xOffsetEnd);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const watchersList: Watcher[] = [];
        
        Object.keys(state).forEach((key) => {
          const userPresences = state[key];
          if (userPresences && userPresences.length > 0) {
            const latest = userPresences[userPresences.length - 1] as any;
            watchersList.push({
              userId: key,
              username: latest.username || "Watcher",
              progress: latest.progress || 0,
              duration: latest.duration || 0,
              isPlaying: !!latest.isPlaying,
              isSynced: !!latest.isSynced,
              updated_at: latest.updated_at || Date.now()
            });
          }
        });
        setWatchers(watchersList);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && playerRef.current) {
          try {
            const p = playerRef.current;
            await channel.track({
              username: username,
              progress: p.getCurrentTime() || 0,
              duration: p.getDuration() || 0,
              isPlaying: p.getPlayerState() === 1,
              isSynced: isSyncedRef.current,
              updated_at: Date.now()
            });
          } catch (e) {
            // ignore initial track errors
          }
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, room.video_url, userId, username]);

  // Periodic Watcher Presence Sync Update (Every 3 seconds)
  useEffect(() => {
    const presenceInterval = setInterval(() => {
      if (channelRef.current && playerRef.current && userId) {
        try {
          const p = playerRef.current;
          const time = p.getCurrentTime() || 0;
          const duration = p.getDuration() || 0;
          const isPlaying = p.getPlayerState() === 1;

          channelRef.current.track({
            username: username,
            progress: time,
            duration: duration,
            isPlaying: isPlaying,
            isSynced: isSyncedRef.current,
            updated_at: Date.now()
          }).then();
        } catch (e) {
          // player context not active yet
        }
      }
    }, 3000);

    return () => clearInterval(presenceInterval);
  }, [userId, username]);

  // Save progress in DB every 10 seconds while playing
  useEffect(() => {
    const dbSaveInterval = setInterval(() => {
      if (playerRef.current) {
        const state = playerRef.current.getPlayerState();
        if (state === 1) { // 1 = Playing
          saveDbProgress(playerRef.current.getCurrentTime());
        }
      }
    }, 10000);

    return () => clearInterval(dbSaveInterval);
  }, [room.id, room.video_url]);

  const broadcastSync = (action: "play" | "pause", time: number) => {
    // Save locally to DB on action changes
    saveDbProgress(time);

    // Stop broadcast if not in sync mode
    if (!isSyncedRef.current) return;

    if (!channelRef.current || isSyncingRef.current) return;
    
    channelRef.current.send({
      type: "broadcast",
      event: "sync-video",
      payload: {
        action,
        time,
        videoId,
        senderId: userId
      }
    });
    
    // Save progress globally for the room if synced
    supabase.from("rooms").update({ video_progress: time }).eq("id", room.id).then();
  };

  const handlePlay = (e: any) => {
    broadcastSync("play", e.target.getCurrentTime());
  };

  const handlePause = (e: any) => {
    broadcastSync("pause", e.target.getCurrentTime());
  };

  const changeVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl) return;
    
    const newId = extractVideoId(inputUrl);
    if (newId) {
      await supabase.from("rooms").update({ video_url: inputUrl, video_progress: 0 }).eq("id", room.id);
      setVideoId(newId);
      setInputUrl("");
      
      if (channelRef.current && isSyncedRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "sync-video",
          payload: { action: "play", time: 0, videoId: newId, senderId: userId }
        });
      }
    } else {
      alert("Invalid YouTube URL");
    }
  };

  // Manual Seek Overrides
  const parseTimestamp = (val: string) => {
    const parts = val.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1]; // MM:SS
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    if (parts.length === 1) return parts[0]; // Seconds
    return null;
  };

  const handleManualSeek = (e: React.FormEvent) => {
    e.preventDefault();
    const seconds = parseTimestamp(manualTime);
    if (seconds !== null && playerRef.current) {
      playerRef.current.seekTo(seconds, true);
      const isPlaying = playerRef.current.getPlayerState() === 1;
      broadcastSync(isPlaying ? "play" : "pause", seconds);
      setManualTime("");
    } else {
      alert("Format error. Use MM:SS or HH:MM:SS (e.g. 10:15 or 1:05:00)");
    }
  };

  const handleQuickShift = (seconds: number) => {
    if (playerRef.current) {
      const currentTime = playerRef.current.getCurrentTime() || 0;
      const newTime = Math.max(0, currentTime + seconds);
      playerRef.current.seekTo(newTime, true);
      const isPlaying = playerRef.current.getPlayerState() === 1;
      broadcastSync(isPlaying ? "play" : "pause", newTime);
    }
  };

  const catchUpToUser = (targetSeconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(targetSeconds, true);
      playerRef.current.playVideo();
      broadcastSync("play", targetSeconds);
    }
  };

  // Floating Emoji Reaction System
  const triggerReactionLocally = (emoji: string, xOffset: number, xOffsetEnd: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    setReactions((prev) => [...prev, { id, emoji, xOffset, xOffsetEnd }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2200);
  };

  const sendReaction = (emoji: string) => {
    if (!channelRef.current || !userId) return;
    const xOffset = Math.random() * 60 - 30;
    const xOffsetEnd = Math.random() * 80 - 40;
    
    channelRef.current.send({
      type: "broadcast",
      event: "reaction",
      payload: {
        emoji,
        senderId: userId,
        xOffset,
        xOffsetEnd
      }
    });

    triggerReactionLocally(emoji, xOffset, xOffsetEnd);
  };

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec)) return "00:00";
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const opts: YouTubeProps['opts'] = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 0,
      modestbranding: 1,
      rel: 0,
      fs: 0,         // Disables native YouTube fullscreen button
      disablekb: 1,  // Disables native YouTube keyboard controls (e.g. 'f' shortcut inside player)
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: isTheaterMode ? '0' : '1rem' }}>
      
      {/* 1. Video Section */}
      <div className={styles.videoSection} style={{ border: 'none', position: 'relative', flex: 1 }}>
        {!isTheaterMode && (
          <div className={styles.panelHeader} style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <form onSubmit={changeVideo} className={styles.inputForm}>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste new YouTube URL here..."
                className={styles.urlInput}
              />
              <button type="submit" className={styles.loadBtn}>
                Load
              </button>
            </form>

            {/* Sync Toggle Controls */}
            <button
              onClick={() => setIsSynced(!isSynced)}
              className={`${styles.toggleBtn} ${isSynced ? styles.active : ""}`}
              style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.8rem", whiteSpace: "nowrap" }}
              title={isSynced ? "Sync playback with room members" : "Watch independently"}
            >
              {isSynced ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{isSynced ? "Synced" : "Independent"}</span>
            </button>
          </div>
        )}
        
        <div className={styles.videoWrapper}>
          {videoId ? (
            <YouTube
              videoId={videoId}
              opts={opts}
              onReady={async (e) => { 
                playerRef.current = e.target; 
                // Fetch user-level left-off progress first, otherwise fallback to global room progress
                let seekTime = 0;
                if (room.video_url) {
                  seekTime = await fetchSavedProgress(room.video_url);
                }
                
                if (seekTime > 0) {
                  e.target.seekTo(seekTime, true);
                } else if (room.video_progress > 0) {
                  e.target.seekTo(room.video_progress, true);
                }
              }}
              onPlay={handlePlay}
              onPause={handlePause}
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
              <Play size={48} className="mb-4 opacity-20" />
              <p>Paste a YouTube URL above to start watching</p>
            </div>
          )}

          {/* Floating Reactions Overlay */}
          <div className={styles.reactionsOverlay}>
            {reactions.map((r) => (
              <span
                key={r.id}
                className={styles.floatingEmoji}
                style={{
                  "--x-offset": `${r.xOffset}px`,
                  "--x-offset-end": `${r.xOffsetEnd}px`,
                } as React.CSSProperties}
              >
                {r.emoji}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Custom Player Controls & Reactions Panel */}
      {!isTheaterMode && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          
          {/* Quick Shift Seekers & Manual Seek Form */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => handleQuickShift(-30)} className={styles.quickSeekBtn} title="Rewind 30s">
              <Rewind size={14} style={{ display: 'inline', marginRight: '3px' }} /> -30s
            </button>
            <button onClick={() => handleQuickShift(30)} className={styles.quickSeekBtn} title="Skip 30s">
              +30s <FastForward size={14} style={{ display: 'inline', marginLeft: '3px' }} />
            </button>

            <form onSubmit={handleManualSeek} className={styles.manualProgressArea} style={{ margin: 0, padding: '0.2rem 0.4rem' }}>
              <input
                type="text"
                placeholder="MM:SS"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className={styles.timestampInput}
                style={{ height: '26px' }}
              />
              <button type="submit" className={styles.seekBtn} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                Jump
              </button>
            </form>
          </div>

          {/* Right side controls: Reactions + Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Reaction Bar Emojis */}
            <div className={styles.reactionsBar}>
              {["😂", "👍", "❤️", "🎉", "😮", "😢"].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className={styles.reactionBtn}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Custom Fullscreen Expand Button */}
            <button
              type="button"
              onClick={onToggleTheaterMode}
              className={styles.quickSeekBtn}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                padding: 0,
                borderRadius: '50%',
                borderColor: 'var(--border-color)',
              }}
              title="Enter Full Screen (Press F)"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 3. Live Watchers Progress Tracker Card */}
      {!isTheaterMode && (
        <div className={styles.panelCard} style={{ flex: '0 0 auto', maxHeight: '140px' }}>
          <div className={styles.panelHeader} style={{ padding: '0.5rem 0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={14} style={{ color: 'var(--accent-teal)' }} />
              <span style={{ fontSize: '0.85rem' }}>Room Member Watch Progress</span>
            </div>
          </div>
          
          <div className={styles.watcherProgressList} style={{ overflowY: 'auto', flex: 1, maxHeight: '90px' }}>
            {watchers.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', margin: 'auto' }}>
                Waiting for progress updates...
              </div>
            ) : (
              watchers.map((w) => {
                const percentage = w.duration > 0 ? (w.progress / w.duration) * 100 : 0;
                const isSelf = w.userId === userId;
                
                return (
                  <div key={w.userId} className={styles.watcherCard}>
                    <div className={styles.watcherMeta}>
                      <div className={styles.watcherUser}>
                        <div className={`${styles.peerDot} ${w.isPlaying ? styles.speaking : ""}`} style={{ width: '22px', height: '22px', fontSize: '0.65rem' }}>
                          {w.username.substring(0, 2).toUpperCase()}
                        </div>
                        <span>
                          {w.username} {isSelf && "(You)"}
                        </span>
                      </div>

                      <div className={styles.watcherState}>
                        <span className={`${styles.syncBadge} ${w.isSynced ? styles.synced : styles.independent}`}>
                          {w.isSynced ? "Synced" : "Independent"}
                        </span>
                        <span className={styles.watcherProgressText}>
                          {formatTime(w.progress)} / {formatTime(w.duration)}
                        </span>
                        {!isSelf && w.progress > 0 && (
                          <button
                            onClick={() => catchUpToUser(w.progress)}
                            className={styles.catchUpBtn}
                            title="Seek your player to match this user's position"
                          >
                            Catch Up
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Subtle Background Progress Bar */}
                    <div className={styles.watcherProgressBar} style={{ width: `${percentage}%` }} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      
    </div>
  );
}
