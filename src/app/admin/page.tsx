'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, Search, Play, Square, Loader2 } from 'lucide-react';

type ResponseData = {
  id: string;
  created_at: string;
  role: string;
  ease_rating: string;
  struggle_area: string;
  transcript: string | null;
  audio_url: string | null;
  duration_seconds: number;
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

export default function AdminDashboard() {
  const [data, setData] = useState<ResponseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: dbData, error } = await supabase
      .from('feedback_responses')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching data:', error);
    } else {
      setData(dbData || []);
    }
    setLoading(false);
  };

  const filteredData = useMemo(() => {
    return data.filter(item => 
      item.role.toLowerCase().includes(search.toLowerCase()) ||
      item.ease_rating.toLowerCase().includes(search.toLowerCase()) ||
      item.struggle_area.toLowerCase().includes(search.toLowerCase()) ||
      (item.transcript && item.transcript.toLowerCase().includes(search.toLowerCase()))
    );
  }, [data, search]);

  const stats = useMemo(() => {
    const mentors = data.filter(d => d.role === 'Mentor').length;
    const mentees = data.filter(d => d.role === 'Mentee').length;
    const parents = data.filter(d => d.role === 'Parent').length;
    
    const easeMapping: Record<string, number> = {
      'Very difficult': 1, 'Difficult': 2, 'Okay': 3, 'Easy': 4, 'Super easy': 5
    };
    
    const totalScore = data.reduce((acc, curr) => acc + (easeMapping[curr.ease_rating] || 0), 0);
    const avgScore = data.length ? (totalScore / data.length).toFixed(1) : '0';

    return { total: data.length, mentors, mentees, parents, avgScore };
  }, [data]);

  const easeData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(d => {
      counts[d.ease_rating] = (counts[d.ease_rating] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [data]);

  const struggleData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(d => {
      counts[d.struggle_area] = (counts[d.struggle_area] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data]);

  const playAudio = (url: string, id: string) => {
    if (playingId === id && audioEl) {
      audioEl.pause();
      setPlayingId(null);
      return;
    }
    if (audioEl) {
      audioEl.pause();
    }
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => setPlayingId(null);
    setAudioEl(audio);
    setPlayingId(id);
  };

  const exportCSV = () => {
    const headers = ['Date', 'Role', 'Ease Rating', 'Struggle Area', 'Transcript', 'Audio URL'];
    const csvData = filteredData.map(row => [
      new Date(row.created_at).toLocaleString(),
      row.role,
      row.ease_rating,
      row.struggle_area,
      row.transcript ? `"${row.transcript.replace(/"/g, '""')}"` : '',
      row.audio_url || ''
    ]);
    
    const csvContent = [headers, ...csvData].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `feedback_export_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Feedback Dashboard</h1>
        <Button onClick={exportCSV} variant="outline"><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total Responses</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Mentors</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.mentors}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Mentees</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.mentees}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Parents</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.parents}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Avg Rating (/5)</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.avgScore}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader><CardTitle>Ease Rating Distribution</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={easeData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label>
                  {easeData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader><CardTitle>Most Common Struggles</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={struggleData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 12}} />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Responses</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <Input placeholder="Search..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Struggle Area</TableHead>
                <TableHead className="w-1/3">Transcript</TableHead>
                <TableHead>Audio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>{row.ease_rating}</TableCell>
                  <TableCell>{row.struggle_area}</TableCell>
                  <TableCell className="text-sm italic text-slate-600">{row.transcript || '-'}</TableCell>
                  <TableCell>
                    {row.audio_url ? (
                      <Button variant="ghost" size="sm" onClick={() => playAudio(row.audio_url!, row.id)}>
                        {playingId === row.id ? <Square className="w-4 h-4 text-red-500" /> : <Play className="w-4 h-4 text-blue-500" />}
                      </Button>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {filteredData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">No responses found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
