import fetch from 'node-fetch';

const Tokens = [
    process.env.TOKEN_1,
    process.env.TOKEN_2,
]

export async function getAllProxies() {
    const proxyList = [];
    for(const token of Tokens) {
        const res = await fetch('https://proxy.webshare.io/api/v2/proxy/list/?mode=direct', {
            headers: {
                'Authorization': `Token ${token}`
            }
        });
    
        const proxyResult = await res.json();   
    
        proxyResult.results.map((proxy) => {
            proxyList.push(
                `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`
            )
        })
    }
    console.log(proxyList);
    
    return proxyList;
}
