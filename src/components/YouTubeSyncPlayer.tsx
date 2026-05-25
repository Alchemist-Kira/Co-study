"use client";

import { useEffect, useState, useRef } from "react";
import YouTube, { YouTubeProps, YouTubePlayer } from "react-youtube";
import { supabase } from "@/lib/supabase";
import styles from "@/app/room/[id]/room.module.css";
import { Play } from "lucide-react";

export default function YouTubeSyncPlayer({ room, userId }: { room: any; userId: string | undefined }) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState("");
  const playerRef = useRef<YouTubePlayer | null>(null);
  const channelRef = useRef<any>(null);
  const isSyncingRef = useRef(false); // prevent infinite loops

  // Extract YouTube ID
  const extractVideoId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
    return match ? match[1] : null;
  };

  useEffect(() => {
    if (room.video_url) {
      setVideoId(extractVideoId(room.video_url));
    }

    if (!room.id || !userId) return;

    const channel = supabase.channel(`room-${room.id}`);
    
    channel
      .on("broadcast", { event: "sync-video" }, ({ payload }) => {
        if (payload.senderId === userId || !playerRef.current) return;
        
        isSyncingRef.current = true;
        
        const player = playerRef.current;
        const currentId = player.getVideoData().video_id;
        
        if (payload.videoId && payload.videoId !== currentId) {
          setVideoId(payload.videoId);
        }
        
        if (payload.action === "play") {
          const currentTime = player.getCurrentTime();
          if (Math.abs(currentTime - payload.time) > 2) {
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
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, room.video_url, userId]);

  // Auto-save progress every 10 seconds while playing
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (playerRef.current) {
        const state = playerRef.current.getPlayerState();
        if (state === 1) { // 1 = Playing
          const time = playerRef.current.getCurrentTime();
          supabase.from("rooms").update({ video_progress: time }).eq("id", room.id).then();
        }
      }
    }, 10000);

    return () => clearInterval(saveInterval);
  }, [room.id]);

  const broadcastSync = (action: "play" | "pause", time: number) => {
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
    
    // Save progress periodically for the room (only host or whoever pauses)
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
      await supabase.from("rooms").update({ video_url: inputUrl }).eq("id", room.id);
      setVideoId(newId);
      setInputUrl("");
      
      if (channelRef.current) {
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

  const opts: YouTubeProps['opts'] = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 0,
      modestbranding: 1,
      rel: 0,
    },
  };

  return (
    <div className={styles.videoSection} style={{ border: 'none' }}>
      <div className={styles.panelHeader} style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
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
      </div>
      
      <div className={styles.videoWrapper}>
        {videoId ? (
          <YouTube
            videoId={videoId}
            opts={opts}
            onReady={(e) => { 
              playerRef.current = e.target; 
              if (room.video_progress > 0) {
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
      </div>
    </div>
  );
}
