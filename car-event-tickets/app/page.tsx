'use client';
import {useEffect,useRef,useState} from 'react';

const URL=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type R={
  status?:string;
  ticket_number?:number;
  checked_in_at?:string;
  checked_in_count?:number;
  total?:number;
  error?:string
};

export default function Page(){
  const [pin,setPin]=useState('');
  const [unlocked,setUnlocked]=useState(false);
  const [loginError,setLoginError]=useState('');
  const [status,setStatus]=useState('START CAMERA');
  const [result,setResult]=useState<R|null>(null);
  const [active,setActive]=useState(false);

  const scanner=useRef<any>(null);
  const busy=useRef(false);

  async function rpc(name:string,args:Record<string,unknown>){
    const r=await fetch(`${URL}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        apikey:KEY,
        Authorization:`Bearer ${KEY}`
      },
      body:JSON.stringify(args)
    });

    if(!r.ok){
      throw new Error(`RPC ${name} failed: ${r.status}`);
    }

    return r.json();
  }

  async function login(e:React.FormEvent){
    e.preventDefault();
    setLoginError('');

    if(!pin.trim()){
      setLoginError('ENTER STAFF PIN');
      navigator.vibrate?.([120,70,120]);
      return;
    }

    try{
      const d:R=await rpc('staff_login',{
        p_pin:pin
      });

      if(d.status!=='authenticated'){
        setLoginError('INVALID STAFF PIN');
        navigator.vibrate?.([120,70,120]);
        return;
      }

      setUnlocked(true);
    }catch{
      setLoginError('CONNECTION ERROR');
    }
  }

  async function submit(token:string){
    if(busy.current)return;

    busy.current=true;
    setStatus('CHECKING...');

    try{
      const d:R=await rpc('check_in_ticket',{
        p_token:token,
        p_pin:pin
      });

      setResult(d);

      if(d.error==='unauthorized'){
        setUnlocked(false);
        setPin('');
        setStatus('STAFF LOGIN REQUIRED');
      }else{
        setStatus(
          d.status==='valid'
            ? 'ACCESS GRANTED'
            : d.status==='already_used'
            ? 'ALREADY USED'
            : 'INVALID TICKET'
        );
      }

      navigator.vibrate?.(
        d.status==='valid'
          ? 120
          : [150,80,150]
      );

      await scanner.current?.pause(true);
    }catch{
      setStatus('SCAN ERROR');
      navigator.vibrate?.([150,80,150]);
    }finally{
      busy.current=false;
    }
  }

  async function start(){
    setResult(null);
    setStatus('POINT CAMERA AT QR');
    setActive(true);

    const {Html5Qrcode}=await import('html5-qrcode');

    if(scanner.current){
      try{
        await scanner.current.stop();
      }catch{}
    }

    scanner.current=new Html5Qrcode('reader');

    try{
      await scanner.current.start(
        {facingMode:'environment'},
        {
          fps:12,
          qrbox:{
            width:260,
            height:260
          }
        },
        submit,
        ()=>{}
      );
    }catch{
      setStatus('CAMERA PERMISSION REQUIRED');
    }
  }

  async function next(){
    setResult(null);
    busy.current=false;

    try{
      await scanner.current?.resume();
    }catch{
      await start();
    }

    setStatus('POINT CAMERA AT QR');
  }

  useEffect(
    ()=>()=>{scanner.current?.stop?.().catch(()=>{})},
    []
  );

  if(!unlocked){
    return (
      <main className="login">
        <form className="card" onSubmit={login}>
          <div className="eyebrow">CAR EVENT</div>

          <h1>STAFF ACCESS</h1>

          <p className="muted">
            Enter the scanner PIN.
          </p>

          <input
            className="pin"
            type="password"
            inputMode="numeric"
            maxLength={12}
            value={pin}
            onChange={e=>setPin(e.target.value)}
            placeholder="••••••"
            autoFocus
          />

          <button className="next" type="submit">
            OPEN SCANNER
          </button>

          {loginError&&(
            <p className="error">{loginError}</p>
          )}
        </form>
      </main>
    );
  }

  const good=status==='ACCESS GRANTED';

  const bad=[
    'ALREADY USED',
    'INVALID TICKET',
    'STAFF LOGIN REQUIRED',
    'SCAN ERROR',
    'CAMERA PERMISSION REQUIRED'
  ].includes(status);

  const total=result?.total??200;
  const inside=result?.checked_in_count??0;

  return (
    <main className="page">
      <div className="eyebrow">CAR EVENT</div>

      <h1 className="title">TICKET SCANNER</h1>

      <p className="muted">
        Scan the QR code on the ticket
      </p>

      <section className={`camera ${good?'good':bad?'bad':''}`}>
        {!active
          ? <button className="primary" onClick={start}>
              OPEN CAMERA
            </button>
          : <div id="reader" className="reader"/>
        }
      </section>

      <div className={`status ${good?'good':bad?'bad':''}`}>
        <div className="status-title">{status}</div>

        {result?.ticket_number&&(
          <div className="ticket">
            TICKET #{String(result.ticket_number).padStart(3,'0')}
          </div>
        )}

        {status==='ALREADY USED'&&result?.checked_in_at&&(
          <div className="first">
            First scan: {new Date(result.checked_in_at).toLocaleTimeString()}
          </div>
        )}
      </div>

      {result&&(
        <button className="next" onClick={next}>
          SCAN NEXT TICKET
        </button>
      )}

      <div className="stats">
        <div className="stat">
          <span>TOTAL</span>
          <strong>{total}</strong>
        </div>

        <div className="stat">
          <span>IN</span>
          <strong>{inside}</strong>
        </div>

        <div className="stat">
          <span>LEFT</span>
          <strong>{total-inside}</strong>
        </div>
      </div>
    </main>
  );
}