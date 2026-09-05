'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play, RotateCcw, Send, CheckCircle2, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

type Step = 'welcome' | 'role' | 'rating' | 'struggle' | 'voice' | 'success';

const roles = ['Mentee', 'Mentor', 'Parent'];
const ratings = [
  { value: 'Very difficult', emoji: '😖' },
  { value: 'Difficult', emoji: '😕' },
  { value: 'Okay', emoji: '😐' },
  { value: 'Easy', emoji: '🙂' },
  { value: 'Super easy', emoji: '😍' }
];
const struggles = [
  'Login / OTP',
  'Finding my mentor or mentee',
  'Booking sessions',
  'Joining meetings',
  'Profile setup',
  "Didn't know what to do next",
  'Other'
];

export default function FeedbackBooth() {
  const [step, setStep] = useState<Step>('welcome');
  const [deviceId, setDeviceId] = useState('');
  
  // Form State
  const [role, setRole] = useState('');
  const [easeRating, setEaseRating] = useState('');
  const [struggleArea, setStruggleArea] = useState('');
  
  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(30);
  const [transcript, setTranscript] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Generate a unique device ID for this browser session if not exists
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('device_id', id);
    }
    setDeviceId(id);
    
    // Setup Speech Recognition if available
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };
    }
  }, []);

  useEffect(() => {
    if (step === 'success') {
      const resetTimer = setTimeout(() => {
        resetForm();
      }, 3000);
      return () => clearTimeout(resetTimer);
    }
  }, [step]);

  const resetForm = () => {
    setStep('welcome');
    setRole('');
    setEaseRating('');
    setStruggleArea('');
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(30);
    setError(null);
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(30);
      
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Microphone access denied or error:', err);
      setError('Microphone access denied. Please allow microphone access to record feedback.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(30);
  };

  const submitFeedback = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      let uploadedAudioUrl = null;
      let durationSeconds = 30 - recordingTime;

      if (audioBlob) {
        const fileName = `${new Date().getFullYear()}/${new Date().getMonth() + 1}/${new Date().getDate()}/${uuidv4()}.webm`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('voice-feedback')
          .upload(fileName, audioBlob, { contentType: 'audio/webm' });

        if (uploadError) {
          console.error('Audio upload failed, proceeding without audio if needed', uploadError);
        } else if (uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('voice-feedback')
            .getPublicUrl(fileName);
          uploadedAudioUrl = publicUrlData.publicUrl;
        }
      }

      const { error: dbError } = await supabase
        .from('feedback_responses')
        .insert([{
          role,
          ease_rating: easeRating,
          struggle_area: struggleArea,
          transcript,
          audio_url: uploadedAudioUrl,
          duration_seconds: durationSeconds,
          device_id: deviceId
        }]);

      if (dbError) throw dbError;

      setStep('success');
    } catch (err: any) {
      console.error('Submission error:', err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // UI Components per step
  const renderWelcome = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center text-center space-y-8"
    >
      <div className="space-y-4">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white">Help us improve the mentoring platform.</h1>
        <p className="text-xl text-slate-500 dark:text-slate-400">Takes less than 30 seconds.</p>
      </div>
      <Button 
        size="lg" 
        className="text-2xl px-12 py-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl hover:shadow-2xl transition-all"
        onClick={() => setStep('role')}
      >
        Start Feedback <ChevronRight className="ml-2 h-8 w-8" />
      </Button>
    </motion.div>
  );

  const renderRole = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-4xl space-y-8"
    >
      <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white">Who are you?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {roles.map(r => (
          <Card 
            key={r} 
            className="cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all border-2 border-transparent"
            onClick={() => { setRole(r); setStep('rating'); }}
          >
            <CardContent className="flex items-center justify-center h-48">
              <span className="text-3xl font-semibold text-slate-800 dark:text-slate-200">{r}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );

  const renderRating = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-5xl space-y-12"
    >
      <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white">How easy was today's platform experience?</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {ratings.map(r => (
          <Card 
            key={r.value} 
            className="cursor-pointer hover:border-blue-500 hover:shadow-xl hover:-translate-y-2 transition-all border-2 border-transparent w-40 h-48 flex flex-col items-center justify-center"
            onClick={() => { setEaseRating(r.value); setStep('struggle'); }}
          >
            <CardContent className="flex flex-col items-center justify-center p-4 space-y-4">
              <span className="text-6xl">{r.emoji}</span>
              <span className="text-lg font-medium text-center text-slate-700 dark:text-slate-300">{r.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );

  const renderStruggle = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-4xl space-y-8"
    >
      <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white">Where did you struggle most?</h2>
      <div className="flex flex-wrap justify-center gap-4">
        {struggles.map(s => (
          <Button 
            key={s} 
            variant="outline" 
            size="lg"
            className="text-xl px-6 py-8 rounded-full border-2 hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-slate-800 transition-all"
            onClick={() => { setStruggleArea(s); setStep('voice'); }}
          >
            {s}
          </Button>
        ))}
      </div>
    </motion.div>
  );

  const renderVoice = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-3xl space-y-12 flex flex-col items-center text-center"
    >
      <h2 className="text-4xl font-bold text-slate-900 dark:text-white">Tell us about the one moment where you got stuck today.</h2>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col items-center justify-center space-y-8 p-12 bg-slate-50 dark:bg-slate-900 rounded-3xl w-full border border-slate-100 dark:border-slate-800 shadow-sm">
        {!audioUrl ? (
          <>
            <div className="relative">
              {isRecording && (
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }} 
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 bg-red-100 dark:bg-red-900/30 rounded-full"
                />
              )}
              <Button
                size="icon"
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative w-32 h-32 rounded-full transition-all ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isRecording ? <Square className="w-12 h-12 text-white" /> : <Mic className="w-12 h-12 text-white" />}
              </Button>
            </div>
            
            <div className="text-3xl font-mono text-slate-600 dark:text-slate-300">
              00:{recordingTime.toString().padStart(2, '0')}
            </div>
            
            {transcript && (
              <div className="w-full max-w-md p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-left italic text-slate-600 dark:text-slate-300">
                "{transcript}"
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center space-y-8 w-full">
            <audio src={audioUrl} controls className="w-full max-w-md" />
            
            <div className="flex space-x-4">
              <Button variant="outline" size="lg" onClick={discardRecording} className="px-8" disabled={isSubmitting}>
                <RotateCcw className="w-5 h-5 mr-2" /> Re-record
              </Button>
              <Button size="lg" onClick={submitFeedback} className="px-8 bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />} 
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {!audioUrl && !isRecording && (
         <Button variant="ghost" onClick={submitFeedback} disabled={isSubmitting} className="text-slate-500">
           Skip voice feedback
         </Button>
      )}
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center text-center space-y-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <CheckCircle2 className="w-32 h-32 text-green-500" />
      </motion.div>
      <h1 className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white">Thank you.</h1>
      <p className="text-2xl text-slate-500 dark:text-slate-400 max-w-2xl">
        Your feedback helps us build a better mentoring experience.
      </p>
    </motion.div>
  );

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
      <AnimatePresence mode="wait">
        {step === 'welcome' && <motion.div key="welcome" className="w-full flex justify-center">{renderWelcome()}</motion.div>}
        {step === 'role' && <motion.div key="role" className="w-full flex justify-center">{renderRole()}</motion.div>}
        {step === 'rating' && <motion.div key="rating" className="w-full flex justify-center">{renderRating()}</motion.div>}
        {step === 'struggle' && <motion.div key="struggle" className="w-full flex justify-center">{renderStruggle()}</motion.div>}
        {step === 'voice' && <motion.div key="voice" className="w-full flex justify-center">{renderVoice()}</motion.div>}
        {step === 'success' && <motion.div key="success" className="w-full flex justify-center">{renderSuccess()}</motion.div>}
      </AnimatePresence>
    </main>
  );
}
