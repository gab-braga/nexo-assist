import fs from 'node:fs';
import ts from 'typescript';
const M={
'muted':'text-muted-foreground text-[13px]',
'logo':'flex items-center gap-2.5 font-bold text-[17px] whitespace-nowrap',
'logo-mark':'inline-flex size-6 items-center justify-center text-[#087bff] text-[27px] font-[950] leading-none tracking-[-3px] pr-[3px]',
'card':'overflow-hidden rounded-[17px] border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]',
'login-page':'grid grid-cols-[55.55%_44.45%] min-h-dvh m800:grid-cols-1',
'login-story':'relative flex min-h-[900px] flex-col bg-[#1c2633] text-white pt-[39px] px-[8%] pb-[47px] [&>a>b]:text-white m1250:px-[7%] m800:min-h-[auto] m800:p-6',
'story-content':'mt-[113px] [&>h1]:font-serif [&>h1]:text-[48px] [&>h1]:font-normal [&>h1]:leading-[1.17] [&>h1]:tracking-[-1.8px] [&>h1]:m-0 [&>h1]:max-w-[650px] m1250:[&>h1]:text-[42px] m800:[&>h1]:text-[36px] m800:[&>h1]:max-w-[540px] m540:[&>h1]:text-[32px]',
'eyebrow':'text-sm text-[#a8adb5] mb-3',
'story-description':'text-base leading-[25px] text-[#b5b9bf] max-w-[510px] mt-[25px] m800:text-sm m800:leading-[23px] m540:mt-5',
'story-demo':'max-w-[502px] mt-9 ml-auto mr-[75px] border border-[#ffffff12] rounded-[17px] bg-[#ffffff03] p-[17px] text-[13px] [&>p]:text-xs [&>p]:mt-[9px] [&>p]:mb-[5px] [&>p]:text-[#ddd] [&>p>span]:text-[#9299a3] [&>p>span]:ml-1 m1250:mr-0 m800:hidden',
'demo-user':'bg-card text-[#1c2633] rounded-[12px_12px_3px_12px] py-2 px-[13px] w-fit ml-auto',
'demo-answer':'py-2.5 px-3.5 bg-[#ffffff16] rounded-[0_13px_13px_13px] max-w-[380px] leading-[21px]',
'demo-ticket':'flex gap-2 items-center bg-card text-muted-foreground rounded-xl py-1.5 px-3 mt-1.5 w-fit text-xs [&>[data-slot=status]]:text-[#1c2633] [&>[data-slot=status]]:font-semibold',
'story-stats':'grid grid-cols-[200px_200px_1fr] mt-auto pt-[23px] border-t border-[#ffffff16] gap-6 [&>div+div]:border-l [&>div+div]:border-[#ffffff16] [&>div+div]:pl-6 [&_strong]:font-serif [&_strong]:text-[30px] [&_strong]:font-normal [&_strong]:flex [&_strong]:items-center [&_strong]:gap-[9px] [&_strong]:mb-[5px] [&_i]:inline-block [&_i]:size-2 [&_i]:shrink-0 [&_i]:rounded-full [&_i]:bg-[#00bd7d] [&_span]:text-[13px] [&_span]:text-[#a6aab2] [&_span]:whitespace-nowrap m1250:grid-cols-3 m1250:gap-3 m1250:[&>div+div]:pl-3 m1250:[&_span]:text-[10px] m800:mt-[30px] m800:[&_strong]:text-2xl m540:[&_span]:whitespace-normal',
'login-form-panel':'relative flex items-center justify-center py-20 px-10 [&>footer]:absolute [&>footer]:bottom-[38px] [&>footer]:inset-x-[9%] [&>footer]:flex [&>footer]:justify-between [&>footer]:gap-4 [&>footer]:text-xs [&>footer]:text-muted-foreground m800:pt-[75px] m800:px-6 m800:pb-[100px] m800:[&>footer]:inset-x-6 m800:[&>footer]:bottom-6 m800:[&>footer]:text-[10px]',
'login-help':'absolute right-[9%] top-[39px] text-muted-foreground text-[13px] [&>a]:text-primary [&>a]:font-medium [&>a]:ml-[5px] m800:top-6 m800:right-6',
'login-form':'w-[380px] -mt-[35px] [&>h2]:font-serif [&>h2]:text-4xl [&>h2]:leading-[1.2] [&>h2]:mb-[13px] [&>h2]:font-normal [&>p]:text-muted-foreground [&>p]:text-[15px] [&>p]:mb-[26px] [&>p]:whitespace-nowrap [&_label]:text-[13px] [&_label]:block [&_label]:mb-1.5 m1250:w-full m1250:[&>p]:whitespace-normal m800:max-w-[420px] m800:mt-0',
'input-icon':'flex items-center border border-[#dfe2e7] rounded-[9px] h-[46px] px-[13px] gap-2.5 shadow-[0_1px_2px_#00000005] [&_svg]:size-4 [&_svg]:text-muted-foreground [&>input]:min-w-0 [&>input]:w-full [&>input]:text-sm [&>input]:bg-transparent [&>input]:focus-visible:outline-none focus-within:border-[#0785ff] focus-within:shadow-[0_0_0_1px_#0785ff]',
'password-label':'flex justify-between mt-4 text-[13px] [&>button]:text-primary [&>button]:mb-1.5',
'password-input':'border-[#0785ff] shadow-[0_0_0_1px_#0785ff] [&>svg]:text-[#0785ff] [&>input]:tracking-[4px]',
'remember':'[&]:flex [&]:items-center [&]:gap-[9px] [&]:mt-[19px] [&]:mb-[27px] [&]:text-[#435066] [&>input]:accent-primary [&>input]:size-[18px]',
'login-submit':'w-full shadow-[0_7px_14px_#0063c920] text-[15px]',
'login-rule':'border-t border-border mt-[27px]',
'customer-shell':'flex min-h-dvh',
'customer-sidebar':'fixed inset-y-0 left-0 z-10 flex w-[232px] flex-col border-r border-border bg-card pt-[19px] px-3.5 pb-[21px] [&>a]:mx-2 [&>a]:mb-5 [&>a]:text-base [&>nav]:flex [&>nav]:flex-col [&>nav]:gap-0.5 [&>nav>a]:h-9 [&>nav>a]:rounded-lg [&>nav>a]:flex [&>nav>a]:items-center [&>nav>a]:gap-2.5 [&>nav>a]:px-2.5 [&>nav>a]:text-[13px] [&>nav>a]:text-[#344156] [&>nav_svg]:size-4 [&>nav_svg]:stroke-[1.6] m800:w-[180px] m800:pt-[18px] m800:px-2.5 m800:[&>a]:text-sm m800:[&>a]:gap-[5px] m800:[&>a>b]:text-[25px] m540:w-[62px] m540:pt-5 m540:px-2 m540:[&>a>span]:text-[0px] m540:[&>a>span]:gap-0 m540:[&>a]:mx-auto m540:[&>a]:mb-6 m540:[&>nav>a]:text-[0px] m540:[&>nav>a]:gap-0 m540:[&>nav>a]:justify-center m540:[&>nav_svg]:size-[19px]',
'selected':'[&]:text-primary [&]:bg-secondary [&]:font-medium',
'sidebar-bottom':'group/account mt-auto border-t border-border pt-[13px] px-2 [&>a]:flex [&>a]:items-center [&>a]:gap-[11px] [&>a]:text-[13px] [&>a]:mt-3 [&>a]:text-[#344156] m800:pl-0.5 m540:pt-3 m540:[&>a]:hidden',
'user-info':'flex items-center gap-2.5 [&>[data-slot=avatar]]:size-[34px] [&>[data-slot=avatar]]:text-xs [&>[data-slot=avatar]]:bg-secondary [&_strong]:block [&_strong]:text-[13px] [&_strong]:font-medium [&_small]:block [&_small]:text-[11px] m800:[&_small]:text-[9px] m540:[&>div]:hidden',
'agent-link':'[&]:absolute [&]:bottom-1.5 [&]:left-6 [&]:text-[10px] [&]:text-[#788398] [&]:mt-[5px] opacity-0 group-hover/account:opacity-100 focus-visible:opacity-100',
'customer-main':'ml-[232px] w-[calc(100%-232px)] m800:ml-[180px] m800:w-[calc(100%-180px)] m540:ml-[62px] m540:w-[calc(100%-62px)]',
'customer-header':'h-16 border-b border-border flex items-center px-8 gap-[11px] text-[13px] [&>span:first-child]:text-muted-foreground [&>strong]:font-medium [&>[data-slot=status]]:ml-auto m800:px-5 m800:gap-2 m800:[&>[data-slot=status]]:text-[10px] m800:[&>[data-slot=status]]:py-[3px] m800:[&>[data-slot=status]]:px-1.5 m540:h-[58px] m540:px-3 m540:text-[11px] m540:gap-1 m540:[&>span:first-child]:hidden m540:[&>svg]:hidden m540:[&>[data-slot=status]]:text-[9px]',
'profile-page':'w-[600px] max-w-[calc(100%-48px)] my-[45px] mx-auto [&>h1]:text-2xl [&>h1]:font-bold [&>h1]:tracking-[-0.6px] [&>h1]:mb-0.5 [&>p]:text-muted-foreground [&>p]:mb-[30px] m800:mt-[30px] m540:max-w-[calc(100%-26px)] m540:mt-[26px] m540:[&>h1]:text-[22px] m540:[&>p]:text-xs',
'profile-details':'[&>div]:flex [&>div]:items-center [&>div]:py-[18px] [&>div]:px-6 [&>div]:gap-3 [&>div]:min-h-[57px] [&>div+div]:border-t [&_span]:w-[164px] [&_span]:shrink-0 [&_span]:text-[13px] [&_span]:text-muted-foreground [&_strong]:text-sm [&_strong]:font-normal [&_small]:flex [&_small]:items-center [&_small]:gap-1 [&_small]:ml-auto [&_small]:whitespace-nowrap m1250:[&>div]:flex-wrap m1250:[&_small]:ml-44 m800:[&>div]:p-4 m800:[&_span]:w-full m800:[&_small]:m-0 m540:[&_strong]:text-xs m540:[&_strong]:break-all',
'password-card':'mt-[30px]',
'password-card-main':'flex items-center gap-4 p-6 [&_strong]:font-medium [&_p]:text-muted-foreground [&_p]:text-[13px] [&>button]:ml-auto [&>button]:text-[#344156] m800:p-4 m800:gap-2.5 m800:flex-wrap m540:[&>button]:ml-0 m540:[&>button]:w-full',
'key-icon':'size-10 bg-muted rounded-full grid place-items-center text-[#435066]',
'password-note':'flex gap-2 items-center bg-muted border-t border-border py-2.5 px-6 text-muted-foreground text-xs m800:py-3 m800:px-4 m800:items-start m800:text-[11px] m800:[&>svg]:shrink-0',
'customer-chat':'group/chat max-w-[808px] mx-auto relative h-[calc(100dvh-64px)] flex flex-col pt-[73px] m1250:mx-8 m1250:max-w-none m800:mx-5 m800:pt-[45px] m540:h-[calc(100dvh-58px)] m540:mx-3 m540:pt-[42px]',
'chat-tools':'absolute top-4 right-0 flex gap-3 text-muted-foreground text-[11px] opacity-0 transition-opacity duration-200 group-hover/chat:opacity-100 focus-within:opacity-100 [&>button]:flex [&>button]:items-center [&>button]:gap-[3px] m800:opacity-100 m800:top-3',
'customer-transcript':'flex-1 min-h-0 overflow-auto [scrollbar-width:thin] pt-[19px] m540:pt-2',
'customer-bubble':'ml-auto mb-[19px] w-fit max-w-[520px] bg-[#1c2633] text-white py-3 px-4 rounded-[12px_12px_3px_12px] leading-[21px] min-h-[43px] group-data-[mode=new]/chat:w-[520px] m800:max-w-[90%] m800:group-data-[mode=new]/chat:w-fit m540:text-xs m540:leading-[19px] m540:mb-[15px] min-[801px]:group-data-[mode=new]/chat:[&:nth-child(3)]:pr-[60px]',
'assistant-group':'mb-[19px] m540:mb-[15px]',
'assistant-label':'flex items-center gap-3.5 text-xs text-muted-foreground mb-1 min-h-[17px] [&>strong]:font-medium [&>strong]:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-[5px] group-data-[mode=new]/chat:mb-[3px] m800:flex-wrap m800:gap-x-2.5 m800:gap-y-1 m800:text-[10px] m540:[&>span]:text-[9px]',
'assistant-bubble':'max-w-[601px] border border-border rounded-[4px_13px_13px_13px] py-3 px-[15px] leading-[22px] [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 m800:text-[13px] m540:p-2.5 m540:text-xs m540:leading-5',
'choice-row':'flex flex-wrap gap-[5px] mt-2.5 [&>button]:h-[33px] [&>button]:font-normal [&>button]:px-[11px] [&>button]:text-[13px] [&>button]:shadow-none m800:[&>button]:text-[11px] m800:[&>button]:px-2',
'choice-selected':'[&]:text-primary [&]:border-ring [&]:bg-secondary',
 'ticket-card':'mt-[5px] [&_h2]:text-lg [&_h2]:leading-[25px] [&_h2]:font-semibold [&_h2]:tracking-[-0.3px] [&_h2]:mb-[5px] [&_p]:text-[13px] [&_p]:text-[#425069] [&_p]:leading-[21px] m800:[&_h2]:text-base m800:[&_p]:text-xs m540:[&_h2]:text-[15px] m540:[&_h2]:leading-[21px]',
 'ticket-body':'py-3.5 px-[17px] m540:p-3',
 'ticket-meta':'flex justify-between items-center text-xs text-muted-foreground mb-1.5 m800:flex-wrap m800:gap-[5px] m540:text-[10px] m540:[&>[data-slot=status]]:text-[10px]',
 'ticket-fields':'grid grid-cols-3 border-t border-border mt-3 pt-2.5 gap-3 [&>div]:flex [&>div]:flex-col [&>div]:gap-0.5 [&_small]:text-xs [&_[data-slot=status]]:text-sm [&_[data-slot=status]]:text-foreground m800:grid-cols-2 m800:gap-2.5 m800:text-xs m540:[&_[data-slot=status]]:text-xs',
 'four':'grid-cols-4 m800:grid-cols-2',
 'ticket-actions':'flex gap-1.5 py-[7px] px-2 bg-muted border-t border-border',
 'ticket-list':'mt-[5px] [&>button]:w-full [&>button]:flex [&>button]:items-center [&>button]:text-left [&>button]:gap-3.5 [&>button]:py-3 [&>button]:px-4 [&>button]:min-h-[45px] [&>button+button]:border-t [&_[data-slot=status]]:text-xs [&_[data-slot=status]]:text-muted-foreground [&_small:last-child]:ml-2 m800:[&>button]:flex-wrap m800:[&>button]:gap-[7px] m800:[&_[data-slot=status]]:ml-[23px] m800:[&_small:last-child]:ml-auto m540:[&>button]:p-2.5 m540:[&_small]:text-[10px]',
 'ticket-list-title':'flex-1 m800:basis-[65%] m800:text-[13px] m540:basis-[55%] m540:text-xs',
 'radio':'border-[1.5px] border-[#cdd2d8] size-4 rounded-full shrink-0',
 'checked':'border-[5px] border-primary',
 'transfer-bubble':'mt-[5px]',
 'overdue':'text-[#946000]',
 'customer-composer':'pb-4 bg-card [&>div]:flex [&>div]:items-center [&>div]:p-[5px] [&>div]:border [&>div]:border-[#dfe2e7] [&>div]:rounded-[13px] [&>div]:min-h-[49px] [&_input]:flex-1 [&_input]:min-w-0 [&_input]:py-[7px] [&_input]:px-2.5 [&_input]:text-sm [&_input]:placeholder:text-muted-foreground [&>small]:block [&>small]:text-right [&>small]:mt-1 m540:[&_input]:text-xs m540:[&_input]:pl-1.5 m540:[&_button]:text-xs m540:[&_button]:px-[9px] m540:[&>small]:text-[10px]',
 'field-label':'block text-[13px] mt-3 mb-1.5',
 'form-input':'w-full border border-border rounded-lg p-2.5 text-sm',
 'agent-console':'group/console h-dvh grid grid-cols-[64px_380px_minmax(380px,1fr)_340px] overflow-hidden min-[1500px]:grid-cols-[64px_380px_minmax(450px,1fr)_340px] m1250:grid-cols-[58px_305px_minmax(360px,1fr)] m800:grid-cols-[54px_245px_minmax(360px,1fr)] m800:overflow-x-auto m540:grid-cols-[48px_210px_minmax(340px,1fr)] m650:grid-cols-[48px_minmax(0,1fr)] m650:overflow-hidden',
 'details-hidden':'grid-cols-[64px_380px_minmax(380px,1fr)] m1250:grid-cols-[58px_305px_minmax(360px,1fr)] m800:grid-cols-[54px_245px_minmax(360px,1fr)] m540:grid-cols-[48px_210px_minmax(340px,1fr)] m650:grid-cols-[48px_minmax(0,1fr)]',
 'agent-rail':'bg-[#f6f7f9] border-r border-border flex items-center flex-col pt-[23px] pb-[15px] gap-5 [&>a>b]:size-6',
 'rail-chat':'relative size-[41px] border border-border rounded-[13px] bg-card grid place-items-center shadow-[0_1px_2px_#00000005] [&>svg]:w-5 [&>b]:absolute [&>b]:top-0.5 [&>b]:right-0 [&>b]:bg-primary [&>b]:text-white [&>b]:border-2 [&>b]:border-white [&>b]:rounded-full [&>b]:size-5 [&>b]:text-[10px]',
 'rail-user':'mt-auto [&>[data-slot=avatar]]:size-9 [&>[data-slot=avatar]]:text-xs [&>[data-slot=avatar]]:bg-[#e4f1fc]',
 'conversation-panel':'border-r border-border overflow-y-auto py-[15px] px-2 m800:px-1 m650:col-start-2 m650:group-data-[mobile-chat=true]/console:hidden',
 'conversation-heading':'flex items-center justify-between px-[7px] pb-[11px] [&>h1]:text-xl [&>h1]:font-[650] [&>h1]:tracking-[-0.4px] m800:items-start m800:gap-[5px] m800:[&>h1]:text-[17px] m800:[&>[data-slot=status]]:text-[10px] m800:[&>[data-slot=status]]:py-1 m800:[&>[data-slot=status]]:px-1.5 m650:[&>h1]:text-xl',
 'search-box':'mx-[7px] mb-3 flex items-center gap-2.5 py-2 px-[13px] bg-muted rounded-[30px] text-muted-foreground text-xs [&>input]:w-full [&>input]:min-w-0 [&>input]:bg-transparent',
 'conversation-tabs':'flex gap-1 px-[7px] pb-2.5 [&>button]:rounded-[30px] [&>button]:bg-muted [&>button]:py-[5px] [&>button]:px-[9px] [&>button]:text-xs [&>button]:whitespace-nowrap [&_b]:font-medium [&_b]:ml-[3px] m800:gap-[3px] m800:flex-wrap m800:[&>button]:text-[10px] m800:[&>button]:py-1 m800:[&>button]:px-1.5 m650:[&>button]:text-xs m650:[&>button]:py-[5px] m650:[&>button]:px-[9px]',
 'conversation-list':'',
 'conversation-item':'group/conversation flex items-center gap-3 w-full pt-[9px] px-2.5 text-left rounded-[13px] [&>[data-slot=avatar]]:size-[46px] [&>div]:min-w-0 [&>div]:flex-1 [&>div]:pb-2.5 [&>div]:border-b [&_p]:overflow-hidden [&_p]:whitespace-nowrap [&_p]:text-ellipsis [&_p]:text-muted-foreground [&_p]:text-[13px] [&_p]:leading-[23px] [&_p]:relative [&_p]:pr-[18px] [&_[data-slot=status]]:text-[11px] [&_[data-slot=status]]:gap-[5px] [&_[data-slot=status]]:leading-[18px] [&_[data-slot=status]>i]:size-1.5 m800:gap-2 m800:px-1.5 m800:[&>[data-slot=avatar]]:size-[35px] m800:[&>[data-slot=avatar]]:text-xs m800:[&_p]:text-[11px] m800:[&_[data-slot=status]]:text-[9px] m650:[&>[data-slot=avatar]]:size-11 m650:[&_p]:text-[13px] m650:[&_[data-slot=status]]:text-[11px]',
 'conversation-name':'flex justify-between items-center gap-2 [&>strong]:text-[15px] [&>strong]:font-medium m800:[&>strong]:text-[13px] m650:[&>strong]:text-[15px]',
 'unread':'absolute right-0 top-0.5 bg-primary text-white rounded-full text-[10px] size-[19px] text-center leading-[19px]',
 'agent-chat':'min-w-0 flex flex-col min-h-0 m800:group-data-[details=false]/console:min-w-[360px] m650:hidden m650:col-start-2 m650:group-data-[mobile-chat=true]/console:flex m650:group-data-[mobile-chat=true]/console:min-w-0',
 'agent-chat-header':'h-16 min-h-16 flex items-center px-5 gap-3 border-b border-border [&>[data-slot=avatar]]:size-10 m800:px-3 m800:gap-[7px] m800:[&>[data-slot=avatar]]:size-8 m800:[&>[data-slot=avatar]]:text-xs m650:h-[78px] m650:min-h-[78px] m650:flex-wrap m650:p-2 m650:gap-[5px]',
 'mobile-back':'hidden m650:block m650:text-[28px] m650:leading-none',
 'agent-person':'flex flex-col whitespace-nowrap [&>strong]:text-[15px] [&>strong]:font-semibold [&>small]:text-xs m800:whitespace-normal m800:[&>strong]:text-[13px] m800:[&>small]:text-[10px] m650:flex-1',
 'agent-header-actions':'flex items-center gap-2.5 ml-auto [&_button]:text-[13px] m1250:gap-[3px] m1250:[&>button]:px-2 m1250:[&>button]:text-[11px] m800:flex-wrap m800:justify-end m800:[&>[data-slot=status]]:text-[10px] m800:[&>button]:h-[27px] m800:[&>button]:text-[9px] m800:[&>button_svg]:size-3 m800:[&>div_button]:w-5 m650:[&>button]:px-[5px]',
 'menu-anchor':'relative',
 'dropdown':'absolute right-0 top-[42px] w-[190px] z-20 p-[5px] border border-border rounded-[10px] bg-card shadow-[0_5px_20px_#0001] [&>button]:p-[9px] [&>button]:text-left [&>button]:text-xs [&>button]:w-full [&>button]:rounded-md [&>button]:hover:bg-muted',
 'agent-transcript':'group/transcript flex-1 min-h-0 overflow-auto [scrollbar-width:thin] bg-[#edf0f4] pt-6 px-[39px] pb-4 flex flex-col justify-end gap-3.5 m1250:p-[25px] m1250:pb-4 m800:p-[18px] m800:pb-4 m540:justify-start m650:justify-start m650:py-4 m650:px-3',
 'assumed':'gap-[15px] min-[1500px]:pt-[25px]',
 'day-divider':'text-center mb-1.5 [&>span]:bg-[#ffffffda] [&>span]:py-1 [&>span]:px-[11px] [&>span]:rounded-[99px] [&>span]:text-xs [&>span]:text-muted-foreground group-data-[assumed=true]/transcript:hidden',
 'agent-message':'group/message shrink-0 max-w-full self-start [[data-from=user]+&[data-from=user]]:-mt-[11px] data-[from=ai]:self-end data-[from=ai]:max-w-[422px] data-[from=agent]:self-end data-[from=agent]:max-w-[422px] group-data-[assumed=true]/transcript:data-[from=ai]:mt-px min-[1500px]:group-data-[assumed=true]/transcript:data-[from=ai]:max-w-[422px] min-[1500px]:group-data-[assumed=true]/transcript:data-[from=agent]:max-w-[422px] m650:data-[from=ai]:max-w-[95%] m650:data-[from=agent]:max-w-[95%]',
 'message-author':'flex items-center justify-end gap-[7px] text-[11px] font-medium mb-1 pr-1.5 [&>span]:bg-[#dcebf9] [&>span]:text-primary [&>span]:rounded [&>span]:leading-4 [&>span]:px-[5px] [&>span]:text-[10px] group-data-[from=agent]/message:[&>span]:bg-[#d9f0e3] group-data-[from=agent]/message:[&>span]:text-[#008557]',
 'message-bubble':'bg-card rounded-[4px_13px_13px_13px] py-2 px-3 leading-[21px] text-sm shadow-[0_1px_2px_#23304708] group-data-[from=ai]/message:bg-[#e5effb] group-data-[from=ai]/message:rounded-[13px_4px_13px_13px] group-data-[from=ai]/message:min-w-0 group-data-[from=agent]/message:bg-[#e2f3e9] group-data-[from=agent]/message:rounded-[13px_4px_13px_13px] m800:text-xs m800:leading-[19px]',
 'message-time':'inline-flex items-center justify-end gap-1 text-[10px] text-muted-foreground ml-2.5 float-right mt-[3px] [&>svg]:text-[#0088ff] group-data-[from=ai]/message:flex group-data-[from=ai]/message:float-none group-data-[from=ai]/message:mt-0 group-data-[from=ai]/message:leading-4 group-data-[from=agent]/message:flex group-data-[from=agent]/message:float-none group-data-[from=agent]/message:mt-0 group-data-[from=agent]/message:leading-4 group-[[data-from=ai]:nth-child(3)]/message:inline-flex group-[[data-from=ai]:nth-child(3)]/message:float-right group-[[data-from=ai]:nth-child(3)]/message:mt-[3px]',
 'event-divider':'flex items-center gap-3 text-muted-foreground text-[11px] shrink-0 my-0.5 before:content-[\'\'] after:content-[\'\'] before:h-px after:h-px before:bg-[#dce0e6] after:bg-[#dce0e6] before:flex-1 after:flex-1 [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:whitespace-nowrap m800:text-[9px] m800:gap-1.5 m650:[&>span]:whitespace-normal',
 'agent-composer':'pt-[11px] px-5 pb-3.5 border-t border-border bg-card [&>input]:w-full [&>input]:bg-muted [&>input]:rounded-[13px] [&>input]:py-3 [&>input]:px-3.5 [&>input]:text-sm [&>input]:min-w-0 [&>input]:disabled:bg-[#f9fafb] [&>form]:flex [&>form]:gap-3 [&>form]:items-center [&>form>input]:w-full [&>form>input]:bg-muted [&>form>input]:rounded-[13px] [&>form>input]:py-3 [&>form>input]:px-3.5 [&>form>input]:text-sm [&>form>input]:min-w-0 [&>form>input]:flex-1 m800:p-2.5',
 'takeover-bar':'flex items-center gap-3 mb-2.5 [&>div]:mr-auto [&_strong]:text-sm [&_strong]:font-semibold [&_strong]:block [&_strong]:whitespace-nowrap [&_small]:block [&_button]:text-[13px] m1250:flex-wrap m1250:gap-[7px] m1250:[&>div]:flex-1 m1250:[&_button]:flex-1 m800:[&_strong]:text-xs m800:[&_small]:text-[10px] m650:[&>div]:min-w-[150px]',
 'hand-icon':'grid place-items-center bg-[#fff7e6] rounded-full size-9 shrink-0 text-[#a76d00]',
 'send-circle':'rounded-full size-11 shrink-0 [&_svg]:size-[19px]',
 'ticket-sidebar':'border-l border-border flex flex-col min-h-0 [&>header]:h-16 [&>header]:flex [&>header]:justify-between [&>header]:items-center [&>header]:px-5 [&>header]:border-b [&>header]:shrink-0 [&>header_strong]:font-semibold [&>header_strong]:text-[15px] [&>header_small]:block [&_h3]:text-xs [&_h3]:text-muted-foreground [&_h3]:font-medium [&_h3]:mb-2.5 m1250:fixed m1250:right-0 m1250:top-16 m1250:bottom-0 m1250:w-80 m1250:bg-card m1250:z-25 m1250:shadow-[-5px_0_25px_#0001] m800:w-[300px] m540:top-0 m540:w-[calc(100%-48px)] m650:hidden m650:group-data-[mobile-chat=true]/console:flex m650:group-data-[mobile-chat=true]/console:w-[calc(100%-48px)] m650:group-data-[mobile-chat=true]/console:top-16',
 'ticket-sidebar-content':'py-[22px] px-[19px] overflow-auto',
 'current-ticket':'rounded-[14px] bg-muted py-3.5 px-4 mb-[30px] [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-[5px] [&>div]:mb-1 [&>strong]:text-[15px] [&>strong]:leading-[22px] [&>strong]:font-medium [&>p]:text-[13px] [&>p]:text-muted-foreground [&>p]:mt-0.5 [&>footer]:flex [&>footer]:gap-2 [&>footer]:items-center [&>footer]:border-t [&>footer]:mt-[13px] [&>footer]:pt-[11px] [&>footer]:text-xs [&>footer]:text-[#435066] [&>footer>small]:ml-auto',
 'other-ticket':'flex items-center gap-[11px] text-left w-full py-3.5 border-b border-border last:border-0 [&>i]:size-[7px] [&>i]:rounded-full [&>i]:shrink-0 [&>div]:flex-1 [&_strong]:block [&_strong]:text-sm [&_strong]:font-normal [&_strong]:leading-[21px] [&_small]:block [&>svg]:text-muted-foreground',
 'all-tickets':'mt-auto mx-[15px] mb-[15px] text-[13px] text-[#344156]',
};
const breakpoints={m1250:1250,m800:800,m650:650,m540:540};
for(const key of Object.keys(M))M[key]=M[key].split(' ').map(token=>token.replace(/^m(1250|800|650|540):/,(_,n)=>`[@media(max-width:${n}px)]:`)).join(' ');
// State class names become conditional utility lists, without changing their expressions.
M.active='';M['mobile-chat-open']='';M['chat-new']='';M['chat-consult']='';
function classes(text){return text.split(/\s+/).filter(Boolean).map(c=>Object.hasOwn(M,c)?M[c]:c).filter(Boolean).join(' ');}
const files=['src/components/login.tsx','src/components/profile.tsx','src/components/shared.tsx','src/components/customer-chat.tsx','src/components/agent-console.tsx'];
for(const file of files){
 let source=fs.readFileSync(file,'utf8');
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const edits=[];
 function visit(node){
  if(ts.isJsxAttribute(node)&&node.name.text==='className'&&node.initializer&&ts.isStringLiteral(node.initializer))edits.push([node.initializer.getStart(tree),node.initializer.end,JSON.stringify(classes(node.initializer.text))]);
  ts.forEachChild(node,visit);
 }
 visit(tree);for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
 fs.writeFileSync(file,source);
}
// Preserve only Tailwind imports and Shadcn theme configuration.
const css=fs.readFileSync('src/style/globals.css','utf8');fs.writeFileSync('src/style/globals.css',css.slice(0,css.indexOf('\n* {'))+'\n');
// Keep global element behavior in utilities on the root, including Radix portals.
let layout=fs.readFileSync('src/app/layout.tsx','utf8');
layout=layout.replace('<body>',`<body className="m-0 bg-background font-sans text-sm text-foreground [&_*]:border-border [&_button]:cursor-pointer [&_a]:cursor-pointer [&_button:disabled]:cursor-default [&_button]:[-webkit-tap-highlight-color:transparent] [&_a]:[-webkit-tap-highlight-color:transparent] [&_input]:[-webkit-tap-highlight-color:transparent] [&_textarea]:[-webkit-tap-highlight-color:transparent] [&_a]:text-inherit [&_a]:no-underline [&_input]:outline-none [&_textarea]:outline-none [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-ring [&_input:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-ring [&_textarea:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-ring [&_button:focus-visible]:outline-offset-[3px] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-ring [&_a:focus-visible]:outline-offset-[3px] [&_small]:text-xs [&_small]:text-muted-foreground [&_kbd]:text-[10px] [&_kbd]:bg-[#ffffff25] [&_kbd]:rounded [&_kbd]:py-px [&_kbd]:px-[5px]">`);
fs.writeFileSync('src/app/layout.tsx',layout);
console.log('Static utility migration complete.');
