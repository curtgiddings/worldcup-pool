-- ============================================================
--  SEED: PROJECTED SCORERS & CREATORS  (run after seed_teams.sql)
-- ------------------------------------------------------------
--  ~150 attackers and playmakers — the players who actually get
--  drafted in a goals/assists pool. Built from the 2026 top-scorer
--  betting markets + each contender's established attacking starters.
--
--  Confidence: high for the headline names; the squad list locked
--  June 1, so sanity-check any borderline player before your draft.
--  Add a missing player anytime:
--    insert into players (name, team_id, position)
--    select 'Some Player', id, 'FW' from teams where name = 'Brazil';
-- ============================================================

insert into public.players (name, team_id, position)
select v.name, t.id, v.pos
from (values
  -- France
  ('Kylian Mbappé','France','FW'),('Ousmane Dembélé','France','FW'),('Michael Olise','France','FW'),
  ('Marcus Thuram','France','FW'),('Randal Kolo Muani','France','FW'),('Bradley Barcola','France','FW'),
  ('Kingsley Coman','France','FW'),
  -- England
  ('Harry Kane','England','FW'),('Jude Bellingham','England','MF'),('Bukayo Saka','England','FW'),
  ('Phil Foden','England','MF'),('Cole Palmer','England','MF'),('Anthony Gordon','England','FW'),
  ('Eberechi Eze','England','MF'),
  -- Spain
  ('Lamine Yamal','Spain','FW'),('Mikel Oyarzabal','Spain','FW'),('Nico Williams','Spain','FW'),
  ('Dani Olmo','Spain','MF'),('Pedri','Spain','MF'),('Ferran Torres','Spain','FW'),('Álvaro Morata','Spain','FW'),
  -- Brazil
  ('Vinícius Júnior','Brazil','FW'),('Rodrygo','Brazil','FW'),('Raphinha','Brazil','FW'),
  ('Endrick','Brazil','FW'),('Lucas Paquetá','Brazil','MF'),('Savinho','Brazil','FW'),('Matheus Cunha','Brazil','FW'),
  -- Argentina
  ('Lionel Messi','Argentina','FW'),('Julián Álvarez','Argentina','FW'),('Lautaro Martínez','Argentina','FW'),
  ('Thiago Almada','Argentina','MF'),('Nico Paz','Argentina','MF'),('Giuliano Simeone','Argentina','FW'),
  -- Portugal
  ('Cristiano Ronaldo','Portugal','FW'),('Bruno Fernandes','Portugal','MF'),('Rafael Leão','Portugal','FW'),
  ('João Félix','Portugal','FW'),('Pedro Neto','Portugal','FW'),('Gonçalo Ramos','Portugal','FW'),
  ('Bernardo Silva','Portugal','MF'),
  -- Germany
  ('Florian Wirtz','Germany','MF'),('Jamal Musiala','Germany','MF'),('Kai Havertz','Germany','FW'),
  ('Serge Gnabry','Germany','FW'),('Leroy Sané','Germany','FW'),('Niclas Füllkrug','Germany','FW'),
  ('Karim Adeyemi','Germany','FW'),
  -- Netherlands
  ('Cody Gakpo','Netherlands','FW'),('Memphis Depay','Netherlands','FW'),('Donyell Malen','Netherlands','FW'),
  ('Tijjani Reijnders','Netherlands','MF'),('Xavi Simons','Netherlands','MF'),('Brian Brobbey','Netherlands','FW'),
  -- Belgium
  ('Romelu Lukaku','Belgium','FW'),('Kevin De Bruyne','Belgium','MF'),('Jérémy Doku','Belgium','FW'),
  ('Loïs Openda','Belgium','FW'),('Leandro Trossard','Belgium','FW'),('Charles De Ketelaere','Belgium','FW'),
  -- Norway
  ('Erling Haaland','Norway','FW'),('Martin Ødegaard','Norway','MF'),('Alexander Sørloth','Norway','FW'),
  ('Antonio Nusa','Norway','FW'),('Oscar Bobb','Norway','FW'),
  -- Uruguay
  ('Darwin Núñez','Uruguay','FW'),('Federico Valverde','Uruguay','MF'),('Facundo Pellistri','Uruguay','FW'),
  ('Giorgian de Arrascaeta','Uruguay','MF'),('Maximiliano Araújo','Uruguay','FW'),
  -- Colombia
  ('Luis Díaz','Colombia','FW'),('James Rodríguez','Colombia','MF'),('Luis Suárez','Colombia','FW'),
  ('Jhon Córdoba','Colombia','FW'),('Rafael Santos Borré','Colombia','FW'),
  -- Croatia
  ('Luka Modrić','Croatia','MF'),('Andrej Kramarić','Croatia','FW'),('Ante Budimir','Croatia','FW'),
  ('Mario Pašalić','Croatia','MF'),('Petar Musa','Croatia','FW'),
  -- Switzerland
  ('Breel Embolo','Switzerland','FW'),('Dan Ndoye','Switzerland','FW'),('Ruben Vargas','Switzerland','FW'),
  ('Zeki Amdouni','Switzerland','FW'),('Granit Xhaka','Switzerland','MF'),
  -- Morocco
  ('Achraf Hakimi','Morocco','DF'),('Youssef En-Nesyri','Morocco','FW'),('Brahim Díaz','Morocco','MF'),
  ('Azzedine Ounahi','Morocco','MF'),('Bilal El Khannouss','Morocco','MF'),
  -- Egypt
  ('Mohamed Salah','Egypt','FW'),('Omar Marmoush','Egypt','FW'),('Mahmoud Trezeguet','Egypt','FW'),
  ('Mostafa Mohamed','Egypt','FW'),
  -- Mexico
  ('Raúl Jiménez','Mexico','FW'),('Santiago Giménez','Mexico','FW'),('Hirving Lozano','Mexico','FW'),
  ('Alexis Vega','Mexico','FW'),
  -- Japan
  ('Kaoru Mitoma','Japan','FW'),('Takefusa Kubo','Japan','MF'),('Ayase Ueda','Japan','FW'),
  ('Daizen Maeda','Japan','FW'),('Takumi Minamino','Japan','MF'),('Junya Ito','Japan','FW'),
  -- South Korea
  ('Son Heung-min','South Korea','FW'),('Lee Kang-in','South Korea','MF'),('Hwang Hee-chan','South Korea','FW'),
  ('Oh Hyeon-gyu','South Korea','FW'),
  -- Senegal
  ('Sadio Mané','Senegal','FW'),('Nicolas Jackson','Senegal','FW'),('Ismaïla Sarr','Senegal','FW'),
  ('Boulaye Dia','Senegal','FW'),
  -- Côte d'Ivoire
  ('Sébastien Haller','Côte d''Ivoire','FW'),('Simon Adingra','Côte d''Ivoire','FW'),('Amad Diallo','Côte d''Ivoire','FW'),
  -- Ghana
  ('Mohammed Kudus','Ghana','MF'),('Iñaki Williams','Ghana','FW'),('Jordan Ayew','Ghana','FW'),
  ('Antoine Semenyo','Ghana','FW'),('Ernest Nuamah','Ghana','FW'),
  -- USA  (full squad seeded separately below)
  ('Christian Pulisic','United States','FW'),('Folarin Balogun','United States','FW'),
  ('Ricardo Pepi','United States','FW'),('Timothy Weah','United States','FW'),
  -- Sweden
  ('Alexander Isak','Sweden','FW'),('Viktor Gyökeres','Sweden','FW'),('Anthony Elanga','Sweden','FW'),
  ('Dejan Kulusevski','Sweden','MF'),
  -- Türkiye
  ('Arda Güler','Türkiye','MF'),('Kenan Yıldız','Türkiye','FW'),('Hakan Çalhanoğlu','Türkiye','MF'),
  ('Barış Alper Yılmaz','Türkiye','FW'),
  -- Austria
  ('Marko Arnautović','Austria','FW'),('Michael Gregoritsch','Austria','FW'),('Marcel Sabitzer','Austria','MF'),
  -- Scotland
  ('Che Adams','Scotland','FW'),('John McGinn','Scotland','MF'),('Lyndon Dykes','Scotland','FW'),
  -- Czechia
  ('Patrik Schick','Czechia','FW'),('Adam Hložek','Czechia','FW'),('Tomáš Chorý','Czechia','FW'),
  -- Croatia/others handled; Canada
  ('Jonathan David','Canada','FW'),('Cyle Larin','Canada','FW'),('Tajon Buchanan','Canada','FW'),
  -- Paraguay
  ('Miguel Almirón','Paraguay','MF'),('Antonio Sanabria','Paraguay','FW'),('Julio Enciso','Paraguay','FW'),
  -- Ecuador
  ('Enner Valencia','Ecuador','FW'),('Kendry Páez','Ecuador','MF'),
  -- Algeria
  ('Riyad Mahrez','Algeria','FW'),('Mohamed Amoura','Algeria','FW'),('Baghdad Bounedjah','Algeria','FW'),
  -- South Africa
  ('Lyle Foster','South Africa','FW'),('Percy Tau','South Africa','FW'),('Themba Zwane','South Africa','MF'),
  -- DR Congo
  ('Yoane Wissa','DR Congo','FW'),('Cédric Bakambu','DR Congo','FW'),
  -- Saudi Arabia / Iran / Qatar
  ('Salem Al-Dawsari','Saudi Arabia','FW'),('Firas Al-Buraikan','Saudi Arabia','FW'),
  ('Mehdi Taremi','Iran','FW'),('Sardar Azmoun','Iran','FW'),
  ('Almoez Ali','Qatar','FW'),('Akram Afif','Qatar','FW'),
  -- Australia / New Zealand
  ('Mitchell Duke','Australia','FW'),('Martin Boyle','Australia','FW'),
  ('Chris Wood','New Zealand','FW'),
  -- Tunisia / Cabo Verde
  ('Youssef Msakni','Tunisia','FW'),('Hannibal Mejbri','Tunisia','MF'),
  ('Garry Rodrigues','Cabo Verde','FW'),('Ryan Mendes','Cabo Verde','FW'),
  -- Jordan / Uzbekistan / Iraq
  ('Mousa Al-Tamari','Jordan','FW'),('Yazan Al-Naimat','Jordan','FW'),
  ('Eldor Shomurodov','Uzbekistan','FW'),
  ('Aymen Hussein','Iraq','FW'),
  -- Bosnia / Panama / Haiti / Curaçao
  ('Edin Džeko','Bosnia and Herzegovina','FW'),('Ermedin Demirović','Bosnia and Herzegovina','FW'),
  ('José Fajardo','Panama','FW'),
  ('Frantzdy Pierrot','Haiti','FW'),
  ('Tahith Chong','Curaçao','MF')
) as v(name, team_name, pos)
join public.teams t on t.name = v.team_name
on conflict do nothing;

-- ---------- Full reported USA squad (announced May 26) ----------
insert into public.players (name, team_id, position)
select v.name, t.id, v.pos
from (values
  ('Chris Brady','GK'),('Matt Freese','GK'),('Matt Turner','GK'),
  ('Max Arfsten','DF'),('Sergiño Dest','DF'),('Alex Freeman','DF'),
  ('Mark McKenzie','DF'),('Tim Ream','DF'),('Chris Richards','DF'),
  ('Antonee Robinson','DF'),('Miles Robinson','DF'),('Joe Scally','DF'),('Auston Trusty','DF'),
  ('Tyler Adams','MF'),('Sebastian Berhalter','MF'),('Weston McKennie','MF'),
  ('Gio Reyna','MF'),('Cristian Roldan','MF'),('Malik Tillman','MF'),
  ('Brenden Aaronson','FW')
) as v(name, pos)
cross join public.teams t
where t.name = 'United States'
on conflict do nothing;
