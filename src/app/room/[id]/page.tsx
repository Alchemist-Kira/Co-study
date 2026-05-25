"use client";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./room.module.css";
import YouTubeSyncPlayer from "@/components/YouTubeSyncPlayer";
import VoiceChat from "@/components/VoiceChat";
import TextChat from "@/components/TextChat";

export default function RoomPage() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [room, setRoom] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }

    if (user && id) {
      // Fetch room details
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
    }
  }, [user, loading, id, router]);

  if (!room) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0B0E14]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6366F1]"></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
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
          <section className={styles.videoSection}>
            <YouTubeSyncPlayer room={room} userId={user?.id} />
          </section>

          <aside className={styles.sidePanel}>
            <TextChat roomId={room.id} userId={user?.id} />
            <VoiceChat roomId={room.id} userId={user?.id} />
          </aside>
        </div>
      </div>
    </div>
  );
}
