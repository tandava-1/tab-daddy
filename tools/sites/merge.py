import json, collections, sys
R = sys.argv[1]
g = json.load(open(f'{R}/global.json')); i = json.load(open(f'{R}/india.json')); a = json.load(open(f'{R}/apps.json'))

# My calls on the 7 cross-list conflicts (shown to the founder for veto)
RESOLVE = {'geeksforgeeks.org': 'Learning', 'w3schools.com': 'Learning', 'quora.com': 'Reference',
           'ilovepdf.com': 'Docs', 'smallpdf.com': 'Docs', 'weather.com': 'Weather', 'accuweather.com': 'Weather'}
# Weather sites the global list parked under Other
WEATHER = {'metoffice.gov.uk', 'wetteronline.de', 'wetter.com'}

rules = {}
def add(host, path, query, cat, src):
    host = host.lower().strip()
    if host.startswith('www.'): host = host[4:]
    k = (host, path or '', query or '')
    r = rules.setdefault(k, {'cats': collections.Counter(), 'src': set()})
    r['cats'][cat] += 1; r['src'].add(src)

def split(m):
    if '/' in m: h, p = m.split('/', 1); return h, '/' + p
    return m, ''

for src, data in (('global', g), ('india', i)):
    for s in data['sites']:
        d = s['domain']
        cat = 'Weather' if d in WEATHER else RESOLVE.get(d, s['category'])
        add(d, '', '', cat, src)
    for m in data['mixed']:
        if m.get('default'): add(m['domain'], '', '', m['default'], src)
        for r in m['rules']:
            if r['match'] == '*': add(m['domain'], '', '', r['category'], src)
            else: add(*split(r['match']), '', r['category'], src)
manual = json.load(open(f'{R}/manual.json'))
for s in manual['sites']:
    add(s['domain'], '', '', s['category'], 'manual')
for r in a['rules']:
    add(r['host'], r.get('path_prefix', ''), r.get('query', ''), r['category'], 'apps' if r.get('verified') else 'apps-unverified')

out, disagreements = [], []
for (h, p, q), r in rules.items():
    cat = r['cats'].most_common(1)[0][0]
    if len(r['cats']) > 1: disagreements.append({'host': h, 'path': p, 'votes': dict(r['cats']), 'chosen': cat})
    out.append({'host': h, 'path': p, 'query': q, 'category': cat, 'sources': sorted(r['src'])})
other = sorted({o['host'] for o in out if o['category'] == 'Other'})
out = [o for o in out if o['category'] != 'Other']
json.dump({'rules': out, 'disagreements': disagreements, 'other': other}, open(f'{R}/merged.json', 'w'))
c = collections.Counter(o['category'] for o in out)
print('rules', len(out), '| hosts', len({o['host'] for o in out}), '| other', len(other), '| disagreements', len(disagreements))
print(sorted(c.items(), key=lambda x: -x[1]))
