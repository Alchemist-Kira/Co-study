"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Video, Plus, Clock, Users } from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";

export default function DashboardPage() {
  const [roomName, setRoomName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentRooms, setRecentRooms] = useState<any[]>([]);
  const [friendRooms, setFriendRooms] = useState<any[]>([]);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    
    const fetchRooms = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (data) setRecentRooms(data);
    };
    fetchRooms();

    const fetchFriendRooms = async () => {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
        
      if (friendships && friendships.length > 0) {
        const friendIds = friendships.map(f => f.user_id === user.id ? f.friend_id : f.user_id);
        
        const { data: rooms } = await supabase
          .from('rooms')
          .select('*, profiles(username)')
          .in('created_by', friendIds)
          .order('created_at', { ascending: false })
          .limit(10);
          
        if (rooms) setFriendRooms(rooms);
      }
    };
    fetchFriendRooms();

    const roomSub = supabase.channel('public:rooms')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rooms' }, () => {
        fetchFriendRooms();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomSub);
    };
  }, [user]);

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roomName.trim()) return;
    
    setLoading(true);
    
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        name: roomName.trim(),
        created_by: user.id,
        video_url: videoUrl.trim() || null,
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      alert("Error creating room: " + error.message);
    } else if (data) {
      router.push(`/room/${data.id}`);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    
    let finalId = joinRoomId.trim();
    if (finalId.includes('/room/')) {
      finalId = finalId.split('/room/')[1].split('?')[0]; // Extract just the ID
    }
    
    router.push(`/room/${finalId}`);
  };

  return (
    <div className={styles.container}>
      <div className={`glass-panel ${styles.panel}`}>
        <div className={styles.iconContainer}>
          <Video size={32} />
        </div>
        
        <h1 className={styles.title}>Create a Watch Room</h1>
        <p className={styles.description}>
          Start a new synchronized viewing session. You can paste any YouTube URL to watch together with your friends.
        </p>
        
        <form onSubmit={createRoom} className={styles.form}>
          <input
            type="text"
            placeholder="Room Name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className={styles.input}
            required
          />
          
          <input
            type="text"
            placeholder="YouTube Video URL (Optional)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className={styles.input}
          />
          
          <button
            type="submit"
            disabled={loading}
            className={styles.submitBtn}
          >
            <Plus size={20} />
            {loading ? "Creating..." : "Create Room"}
          </button>
        </form>

        <div style={{ width: '100%', maxWidth: '24rem', margin: '2rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
        </div>

        <form onSubmit={handleJoinRoom} className={styles.form} style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Paste Room ID or full URL..."
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            className={styles.input}
            required
          />
          <button type="submit" className={styles.submitBtn} style={{ backgroundColor: 'var(--bg-surface-hover)' }}>
            Join Friend's Room
          </button>
        </form>

        {friendRooms.length > 0 && (
          <div className={styles.recentRooms} style={{ marginTop: '1.5rem' }}>
            <h3 className={styles.recentTitle} style={{ color: 'var(--accent-teal)' }}>
              <Users size={16} style={{ display: 'inline', marginRight: '6px', marginBottom: '2px' }} />
              Friends' Active Rooms
            </h3>
            {friendRooms.map((room) => (
              <Link href={`/room/${room.id}`} key={room.id} className={styles.roomLink} style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                <span className={styles.roomName}>
                  {room.name} 
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                    by {room.profiles?.username}
                  </span>
                </span>
                <span className={styles.joinBtn} style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>Join</span>
              </Link>
            ))}
          </div>
        )}

        {recentRooms.length > 0 && (
          <div className={styles.recentRooms}>
            <h3 className={styles.recentTitle}>
              <Clock size={16} style={{ display: 'inline', marginRight: '6px', marginBottom: '2px' }} />
              Your Recent Rooms
            </h3>
            {recentRooms.map((room) => (
              <Link href={`/room/${room.id}`} key={room.id} className={styles.roomLink}>
                <span className={styles.roomName}>{room.name}</span>
                <span className={styles.joinBtn}>Re-join</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
