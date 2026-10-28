import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoyaltyContext } from '../../LoyaltyProvider'
import type { Bootstrap, MemberRow } from '../../lib/types'
import { overviewScope } from '../../overview/overviewMath'
import { ScanMember, ScanIdentity } from './ScanMember'
import { ScanReader } from './ScanReader'
import en from '../../i18n/scandesign.en.json'
import ru from '../../i18n/scandesign.ru.json'
import de from '../../i18n/scandesign.de.json'
import fr from '../../i18n/scandesign.fr.json'
import es from '../../i18n/scandesign.es.json'
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'en'},t:(key:string,fallback?:string|{defaultValue?:string})=>typeof fallback==='string'?fallback:fallback?.defaultValue??key})}))
vi.mock('../../../lib/api',()=>({api:{},resolveImage:(v:unknown)=>v}))
const can={award:true,redeem:true,reverse:false,manage_program:false,manage_rewards:false,manage_members:false,view_insights:false,manage_campaigns:false,manage_app:false}
const boot:Bootstrap={name:'Loyalty',organization:{id:1,name:'Venue',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-28',currency:'EUR'},features:{campaigns:false,wallet:false,push:false},staff:{id:1,name:'Staff',role:'staff',can},programme:{on:true,tiers:[]},counts:{members:1,requests_waiting:0}}
const member:MemberRow={id:3,name:'Member',email:null,phone:null,member_number:'M-3',tier_id:null,points:25,lifetime_points:25,is_active:true,joined_at:null,last_activity_at:null}
function render(node:React.ReactNode,options={boot,detail:true}){const client=new QueryClient();if(options.detail)client.setQueryData(['loyalty','member',3,overviewScope(options.boot)],{member,benefits:[],requests:[]});return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><LoyaltyContext.Provider value={{data:options.boot,isLoading:false,isError:false,error:null,refetch:()=>{}}}>{node}</LoyaltyContext.Provider></MemoryRouter></QueryClientProvider>)}
describe('Scan redesign integration boundaries',()=>{
  it('does not mount live hardware before an explicit start',()=>{const html=render(<ScanReader reader="camera" active={false} busy={false} event={false} contextName="Desk" onStart={()=>{}} onOptions={()=>{}} onManual={()=>{}} onCamera={()=>{}} />);expect(html).toContain('Start camera');expect(html).not.toContain('<video');expect(html).not.toContain('autofocus')})
  it('never shows an expired membership as Active',()=>{const html=render(<ScanIdentity member={{...member,valid_until:'2026-10-20',membership_state:'expired'}} />);expect(html).toContain('Expired');expect(html).not.toContain('>Active<')})
  it('hides award and redeem actions without their independent permissions',()=>{const html=render(<ScanMember member={member} onNext={()=>{}} />,{boot:{...boot,staff:{...boot.staff,can:{...can,award:false,redeem:false}}},detail:true});expect(html).not.toContain('Award points');expect(html).not.toContain('Redeem points');expect(html).toContain('View profile')})
  it('waits for authoritative detail before enabling member actions',()=>{const html=render(<ScanMember member={member} onNext={()=>{}} />,{boot,detail:false});expect(html).toContain('disabled');expect(html).not.toContain('type="number"')})
  it.each([ru,de,fr,es])('provides every scan string in each shipped locale',locale=>{expect(Object.keys(locale).sort()).toEqual(Object.keys(en).sort());expect(Object.values(locale).every(value=>value.trim().length>0)).toBe(true)})
})
