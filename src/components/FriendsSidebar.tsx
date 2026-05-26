"use client";

import { useAuth } from "@/context/AuthContext";
import { LogOut, Search, UserPlus, Check, X } from "lucide-react";
import styles from "@/app/dashboard/dashboard.module.css";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function FriendsSidebar() {
  const { user, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [friends, setFriends] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [currentUsername, setCurrentUsername] = useState("Loading...");

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.username) {
            setCurrentUsername(data.username);
          } else {
            setCurrentUsername(user.email || "User");
          }
        });
    }
  }, [user]);

  const fetchFriends = async () => {
    if (!user) return;
    
    // Fetch all friendships where user is involved
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,
        status,
        user_id,
        friend_id,
        user:profiles!friendships_user_id_fkey(id, username),
        friend:profiles!friendships_friend_id_fkey(id, username)
      `)
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
      
    if (data) {
      // Accepted friends (from either direction)
      const accepted = data
        .filter(d => d.status === 'accepted')
        .map(d => (d.user_id === user.id ? d.friend : d.user));
        
      // Pending requests SENT TO the current user
      const pendingIncoming = data
        .filter(d => d.status === 'pending' && d.friend_id === user.id)
        .map(d => ({ ...d.user, request_id: d.id }));

      setFriends(accepted);
      setIncomingRequests(pendingIncoming);
    }
  };

  useEffect(() => {
    fetchFriends();
    
    const channel = supabase.channel('friendships_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        fetchFriends();
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    }
  }, [user]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !user) return;
    
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', searchQuery.trim())
      .single();
      
    if (users) {
      if (users.id === user.id) {
        alert("You cannot add yourself.");
        return;
      }
      
      const { error } = await supabase.from('friendships').insert({
        user_id: user.id,
        friend_id: users.id,
        status: 'pending'
      });
      
      if (error) {
        if (error.code === '23505') alert("Friend request already exists or you are already friends!");
        else alert("Error sending request.");
      } else {
        setSearchQuery("");
        alert("Friend request sent!");
        fetchFriends();
      }
    } else {
      alert("User not found!");
    }
  };

  const handleAccept = async (requestId: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
    fetchFriends();
  };

  const handleDecline = async (requestId: string) => {
    await supabase.from('friendships').delete().eq('id', requestId);
    fetchFriends();
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Friends</span>
      </div>

      <form onSubmit={handleAddFriend} className={styles.addFriendSection}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button type="submit" className={styles.searchBtn}>
          <UserPlus size={16} style={{ display: 'inline', marginRight: '6px' }} />
          Add Friend
        </button>
      </form>
      
      <div className={styles.friendsList}>
        {incomingRequests.length > 0 && (
          <div>
            <h4 className={styles.sectionTitle}>Requests</h4>
            {incomingRequests.map((req, idx) => (
              <div key={idx} className={styles.requestItem}>
                <div className={styles.requestInfo}>
                  <div className={styles.avatar} style={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                    {req?.username?.substring(0, 2).toUpperCase()}
                  </div>
                  <span className={styles.friendName}>{req?.username}</span>
                </div>
                <div className={styles.actionBtns}>
                  <button onClick={() => handleAccept(req.request_id)} className={styles.acceptBtn} title="Accept">
                    <Check size={16} />
                  </button>
                  <button onClick={() => handleDecline(req.request_id)} className={styles.declineBtn} title="Decline">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
            <div className={styles.divider} />
          </div>
        )}

        <h4 className={styles.sectionTitle}>Online</h4>
        {friends.length === 0 ? (
          <div className="text-center text-sm text-gray-500 mt-4" style={{ padding: '0 1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            No friends yet. Add someone!
          </div>
        ) : (
          friends.map((friend: any, idx) => (
            <div key={idx} className={styles.friendItem}>
              <div className={styles.avatar}>
                {friend?.username?.substring(0, 2).toUpperCase() || 'U'}
              </div>
              <div className={styles.friendInfo}>
                <span className={styles.friendName}>{friend?.username || 'Unknown'}</span>
                <span className={styles.status}>
                  <div className={styles.statusDot}></div>
                  Online
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Logged in User Profile Info Card */}
      <div className={styles.currentUserSection}>
        <div className={styles.currentUserInfo}>
          <div className={styles.avatar} style={{ width: 36, height: 36, fontSize: '0.85rem' }}>
            {currentUsername.substring(0, 2).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span className={styles.currentUserLabel}>You</span>
            <span className={styles.currentUserName} title={currentUsername}>
              {currentUsername}
            </span>
          </div>
        </div>
        <button onClick={signOut} className={styles.logoutBtn} title="Sign Out" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
