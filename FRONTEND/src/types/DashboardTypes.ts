interface ServiceData {
	id: string;
	name: string;
	type:
		| 'nginx'
		| 'apache'
		| 'mysql'
		| 'postgresql'
		| 'redis'
		| 'mongodb'
		| 'wordpress'
		| 'nodejs'
		| 'docker'
		| 'php';
	status: 'running' | 'stopped' | 'error';
	port: number;
	version: string;
	cpu: number;
	memory: number;
}

interface WebsiteData {
	id: string;
	domain: string;
	type: 'wordpress' | 'static' | 'nodejs' | 'php' | 'react';
	status: 'active' | 'inactive' | 'maintenance';
	ssl: boolean;
	visits: number;
	storage: number;
}

interface DatabaseData {
	id: string;
	name: string;
	type: 'mysql' | 'postgresql' | 'mongodb' | 'redis';
	size: number;
	tables: number;
	connections: number;
	status: 'connected' | 'disconnected';
}

export interface ServerData {
	id: string;
	name: string;
	status: 'online' | 'offline' | 'warning';
	cpu: number;
	memory: number;
	disk: number;
	uptime: string;
	location: string;
	ip: string;
	os: string;
	activeServices?: number;
	services: ServiceData[];
	websites: WebsiteData[];
	databases: DatabaseData[];
}
