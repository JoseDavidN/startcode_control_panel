-- Esquema inicial de StartCode Panel (backend 0.7.0).
-- Generado por docker/generate-schema.sh desde las entidades de TypeORM: no editar a mano.
-- Postgres lo ejecuta solo al crear el volumen de datos (docker-entrypoint-initdb.d).

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: tbl_ai_assistant_configs_enu_provider_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_ai_assistant_configs_enu_provider_enum AS ENUM (
    'anthropic',
    'openai',
    'gemini'
);


--
-- Name: tbl_ai_assistant_messages_enu_provider_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_ai_assistant_messages_enu_provider_enum AS ENUM (
    'anthropic',
    'openai',
    'gemini'
);


--
-- Name: tbl_ai_assistant_messages_enu_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_ai_assistant_messages_enu_role_enum AS ENUM (
    'user',
    'assistant'
);


--
-- Name: tbl_database_connections_enu_engine_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_database_connections_enu_engine_enum AS ENUM (
    'mysql',
    'mariadb',
    'postgresql',
    'redis'
);


--
-- Name: tbl_database_connections_enu_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_database_connections_enu_status_enum AS ENUM (
    'unknown',
    'connected',
    'disconnected'
);


--
-- Name: tbl_database_connections_enu_tag_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_database_connections_enu_tag_enum AS ENUM (
    'production',
    'staging',
    'testing',
    'development',
    'backup'
);


--
-- Name: tbl_notifications_enu_severity_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_notifications_enu_severity_enum AS ENUM (
    'info',
    'warning',
    'error'
);


--
-- Name: tbl_notifications_enu_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_notifications_enu_type_enum AS ENUM (
    'server_offline',
    'server_online',
    'cpu_high',
    'memory_high',
    'disk_high',
    'security',
    'system'
);


--
-- Name: tbl_servers_enu_os_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_servers_enu_os_enum AS ENUM (
    'ubuntu',
    'centos',
    'debian',
    'fedora',
    'arch',
    'solaris',
    'openbsd',
    'netbsd',
    'freebsd',
    'other'
);


--
-- Name: tbl_servers_enu_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_servers_enu_status_enum AS ENUM (
    'online',
    'offline',
    'maintenance',
    'error',
    'warning',
    'pending',
    'checking'
);


--
-- Name: tbl_servers_enu_tag_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_servers_enu_tag_enum AS ENUM (
    'production',
    'staging',
    'testing',
    'development',
    'backup'
);


--
-- Name: tbl_users_enu_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tbl_users_enu_role_enum AS ENUM (
    'admin',
    'user',
    'viewer'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: tbl_agent_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_agent_metrics (
    server_id uuid NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    cpu_manufacturer character varying(100),
    cpu_brand character varying(255),
    cpu_cores integer,
    cpu_physical_cores integer,
    cpu_usage numeric(5,2),
    cpu_usage_per_core jsonb,
    cpu_load_average_1m numeric(5,2),
    cpu_load_average_5m numeric(5,2),
    cpu_load_average_15m numeric(5,2),
    memory_total bigint,
    memory_used bigint,
    memory_free bigint,
    memory_available bigint,
    memory_usage_percent numeric(5,2),
    swap_total bigint,
    swap_used bigint,
    swap_free bigint,
    swap_usage_percent numeric(5,2),
    disk_filesystems jsonb,
    network_public_ip character varying(45),
    network_private_ips jsonb,
    network_connections_active integer,
    network_connections_listening integer,
    network_interfaces jsonb,
    system_hostname character varying(255),
    system_platform character varying(50),
    system_distro character varying(255),
    system_kernel character varying(100),
    system_arch character varying(20),
    system_uptime numeric(15,2),
    system_boot_time timestamp with time zone,
    processes_total integer DEFAULT 0,
    processes_running integer DEFAULT 0,
    processes_sleeping integer DEFAULT 0,
    processes_stopped integer DEFAULT 0,
    processes_zombie integer DEFAULT 0,
    processes_top_list jsonb,
    services_count integer DEFAULT 0,
    services_active integer DEFAULT 0,
    services_failed integer DEFAULT 0,
    services_list jsonb,
    websites_count integer DEFAULT 0,
    websites_list jsonb,
    databases_count integer DEFAULT 0,
    databases_list jsonb,
    agent_version character varying(50),
    message_id character varying(100),
    message_type character varying(50)
);


--
-- Name: tbl_agent_metrics_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_agent_metrics_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    server_id uuid NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    cpu_usage numeric(5,2),
    cpu_load_average_1m numeric(5,2),
    memory_usage_percent numeric(5,2),
    swap_usage_percent numeric(5,2),
    disk_usage_percent numeric(5,2),
    network_connections_active integer,
    system_uptime numeric(15,2)
);


--
-- Name: tbl_ai_assistant_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_ai_assistant_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    enu_provider public.tbl_ai_assistant_configs_enu_provider_enum NOT NULL,
    str_model character varying(128) NOT NULL,
    str_api_key_enc text NOT NULL,
    str_api_key_hint character varying(8) NOT NULL,
    bol_enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_ai_assistant_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_ai_assistant_memory (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    str_summary text DEFAULT ''::text NOT NULL,
    int_summarized_count integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_ai_assistant_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_ai_assistant_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    enu_role public.tbl_ai_assistant_messages_enu_role_enum NOT NULL,
    str_content text NOT NULL,
    enu_provider public.tbl_ai_assistant_messages_enu_provider_enum,
    str_model character varying(128),
    bol_summarized boolean DEFAULT false NOT NULL,
    dat_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_command_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_command_audit (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    str_server_id uuid NOT NULL,
    str_command text NOT NULL,
    str_cwd character varying(1024),
    bol_sudo boolean DEFAULT false NOT NULL,
    str_status character varying(16) NOT NULL,
    int_exit_code integer,
    int_duration_ms integer DEFAULT 0 NOT NULL,
    bol_truncated boolean DEFAULT false NOT NULL,
    dat_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_database_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_database_connections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    str_name character varying NOT NULL,
    enu_engine public.tbl_database_connections_enu_engine_enum NOT NULL,
    str_host character varying NOT NULL,
    int_port integer NOT NULL,
    str_username character varying DEFAULT ''::character varying NOT NULL,
    str_password_enc text,
    enu_tag public.tbl_database_connections_enu_tag_enum,
    str_database character varying,
    enu_status public.tbl_database_connections_enu_status_enum DEFAULT 'unknown'::public.tbl_database_connections_enu_status_enum NOT NULL,
    str_version character varying,
    str_last_error text,
    dat_last_checked timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_database_query_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_database_query_audit (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    str_connection_id uuid NOT NULL,
    str_schema character varying,
    str_query text NOT NULL,
    str_reason character varying NOT NULL,
    str_status character varying(16) NOT NULL,
    int_affected_rows integer,
    str_error text,
    int_duration_ms integer DEFAULT 0 NOT NULL,
    dat_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    str_server_id uuid,
    enu_type public.tbl_notifications_enu_type_enum NOT NULL,
    enu_severity public.tbl_notifications_enu_severity_enum DEFAULT 'info'::public.tbl_notifications_enu_severity_enum NOT NULL,
    str_title character varying NOT NULL,
    str_body text NOT NULL,
    json_metadata jsonb,
    bol_read boolean DEFAULT false NOT NULL,
    dat_read_at timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_servers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_servers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_name character varying NOT NULL,
    str_host character varying NOT NULL,
    int_port integer DEFAULT 22 NOT NULL,
    str_username character varying NOT NULL,
    str_privatekey text NOT NULL,
    enu_status public.tbl_servers_enu_status_enum DEFAULT 'offline'::public.tbl_servers_enu_status_enum NOT NULL,
    enu_os public.tbl_servers_enu_os_enum NOT NULL,
    enu_tag public.tbl_servers_enu_tag_enum,
    dat_favorited timestamp with time zone,
    str_description text,
    json_metadata jsonb,
    dat_last_seen timestamp with time zone,
    str_hostname text,
    str_os_version text,
    str_kernel_version text,
    str_owner_id uuid NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "lastCheckAt" timestamp with time zone
);


--
-- Name: tbl_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_user_id uuid NOT NULL,
    str_refresh_hash character varying(64) NOT NULL,
    str_user_agent text,
    str_ip character varying(64),
    dat_last_used timestamp with time zone NOT NULL,
    dat_expires_at timestamp with time zone NOT NULL,
    bol_revoked boolean DEFAULT false NOT NULL,
    bol_persistent boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    str_firstname character varying NOT NULL,
    str_lastname character varying NOT NULL,
    str_email character varying NOT NULL,
    str_password character varying NOT NULL,
    enu_role public.tbl_users_enu_role_enum DEFAULT 'user'::public.tbl_users_enu_role_enum NOT NULL,
    bol_is_active boolean DEFAULT true NOT NULL,
    bol_two_factor_enabled boolean DEFAULT false NOT NULL,
    str_two_factor_secret character varying(255),
    int_two_factor_last_step bigint,
    json_two_factor_backup_codes jsonb,
    dat_backup_codes_generated_at timestamp with time zone,
    int_failed_login_attempts integer DEFAULT 0 NOT NULL,
    dat_locked_until timestamp with time zone,
    json_preferences jsonb,
    dat_last_login timestamp without time zone,
    dat_password_changed_at timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_agent_metrics_history PK_01dc381e6c0ed8b380f2b090f95; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_metrics_history
    ADD CONSTRAINT "PK_01dc381e6c0ed8b380f2b090f95" PRIMARY KEY (id);


--
-- Name: tbl_ai_assistant_configs PK_0acb7e22b4078ed016bff261d33; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_configs
    ADD CONSTRAINT "PK_0acb7e22b4078ed016bff261d33" PRIMARY KEY (id);


--
-- Name: tbl_database_connections PK_1acfa53f5e9e65bf85fef3e72ba; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_database_connections
    ADD CONSTRAINT "PK_1acfa53f5e9e65bf85fef3e72ba" PRIMARY KEY (id);


--
-- Name: tbl_servers PK_2936375f55e79be3bee82a72531; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_servers
    ADD CONSTRAINT "PK_2936375f55e79be3bee82a72531" PRIMARY KEY (id);


--
-- Name: tbl_ai_assistant_memory PK_80784a9f96a77e1fe3bbf0025b4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_memory
    ADD CONSTRAINT "PK_80784a9f96a77e1fe3bbf0025b4" PRIMARY KEY (id);


--
-- Name: tbl_command_audit PK_81573c49a1e0fbec7aab7dcc4a7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_command_audit
    ADD CONSTRAINT "PK_81573c49a1e0fbec7aab7dcc4a7" PRIMARY KEY (id);


--
-- Name: tbl_notifications PK_864f5e52afeed73fdfd87ba738b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT "PK_864f5e52afeed73fdfd87ba738b" PRIMARY KEY (id);


--
-- Name: tbl_agent_metrics PK_9886c6dbc07f14f213d0d7b2330; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_metrics
    ADD CONSTRAINT "PK_9886c6dbc07f14f213d0d7b2330" PRIMARY KEY (server_id);


--
-- Name: tbl_ai_assistant_messages PK_b3d7ae49c8ed4c522d2fb3eac53; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_messages
    ADD CONSTRAINT "PK_b3d7ae49c8ed4c522d2fb3eac53" PRIMARY KEY (id);


--
-- Name: tbl_users PK_bb1d884179b3e42514b36c01e4e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_users
    ADD CONSTRAINT "PK_bb1d884179b3e42514b36c01e4e" PRIMARY KEY (id);


--
-- Name: tbl_sessions PK_c60f5680e928cbe2fa118b63c90; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sessions
    ADD CONSTRAINT "PK_c60f5680e928cbe2fa118b63c90" PRIMARY KEY (id);


--
-- Name: tbl_database_query_audit PK_d7fcdfa66f93dac60ad86cd67e3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_database_query_audit
    ADD CONSTRAINT "PK_d7fcdfa66f93dac60ad86cd67e3" PRIMARY KEY (id);


--
-- Name: tbl_ai_assistant_configs REL_65766b43b1736203a1a6f02646; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_configs
    ADD CONSTRAINT "REL_65766b43b1736203a1a6f02646" UNIQUE (str_user_id);


--
-- Name: tbl_ai_assistant_memory REL_9e7e97761aae25dd1616cb8995; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_memory
    ADD CONSTRAINT "REL_9e7e97761aae25dd1616cb8995" UNIQUE (str_user_id);


--
-- Name: tbl_users UQ_824e43bd5ce1ceedc6d6a9c6d30; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_users
    ADD CONSTRAINT "UQ_824e43bd5ce1ceedc6d6a9c6d30" UNIQUE (str_email);


--
-- Name: idx_agent_metrics_history_server_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_metrics_history_server_ts ON public.tbl_agent_metrics_history USING btree (server_id, "timestamp");


--
-- Name: idx_ai_assistant_configs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ai_assistant_configs_user ON public.tbl_ai_assistant_configs USING btree (str_user_id);


--
-- Name: idx_ai_assistant_memory_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ai_assistant_memory_user ON public.tbl_ai_assistant_memory USING btree (str_user_id);


--
-- Name: idx_ai_assistant_messages_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_assistant_messages_user_created ON public.tbl_ai_assistant_messages USING btree (str_user_id, dat_created_at);


--
-- Name: idx_command_audit_server_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_command_audit_server_created ON public.tbl_command_audit USING btree (str_server_id, dat_created_at);


--
-- Name: idx_database_connections_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_connections_user ON public.tbl_database_connections USING btree (str_user_id);


--
-- Name: idx_database_query_audit_connection_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_query_audit_connection_created ON public.tbl_database_query_audit USING btree (str_connection_id, dat_created_at);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.tbl_notifications USING btree (str_user_id, "createdAt");


--
-- Name: idx_notifications_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read ON public.tbl_notifications USING btree (str_user_id, bol_read);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.tbl_sessions USING btree (str_user_id);


--
-- Name: tbl_database_query_audit FK_1a0ad7dea8a2aa1ece11b816cc5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_database_query_audit
    ADD CONSTRAINT "FK_1a0ad7dea8a2aa1ece11b816cc5" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_database_connections FK_2167e4f552529958455b5663b92; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_database_connections
    ADD CONSTRAINT "FK_2167e4f552529958455b5663b92" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_ai_assistant_configs FK_65766b43b1736203a1a6f02646e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_configs
    ADD CONSTRAINT "FK_65766b43b1736203a1a6f02646e" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_ai_assistant_messages FK_867a64be40df87e94e417960f9e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_messages
    ADD CONSTRAINT "FK_867a64be40df87e94e417960f9e" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_servers FK_87fe9ba1ab3ffa1e1b55d55d943; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_servers
    ADD CONSTRAINT "FK_87fe9ba1ab3ffa1e1b55d55d943" FOREIGN KEY (str_owner_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_sessions FK_8d238e59434355bec8c455a50b6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sessions
    ADD CONSTRAINT "FK_8d238e59434355bec8c455a50b6" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_database_query_audit FK_9098f02149ada6cfae40579122c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_database_query_audit
    ADD CONSTRAINT "FK_9098f02149ada6cfae40579122c" FOREIGN KEY (str_connection_id) REFERENCES public.tbl_database_connections(id) ON DELETE CASCADE;


--
-- Name: tbl_agent_metrics FK_9886c6dbc07f14f213d0d7b2330; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_metrics
    ADD CONSTRAINT "FK_9886c6dbc07f14f213d0d7b2330" FOREIGN KEY (server_id) REFERENCES public.tbl_servers(id) ON DELETE CASCADE;


--
-- Name: tbl_ai_assistant_memory FK_9e7e97761aae25dd1616cb89954; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assistant_memory
    ADD CONSTRAINT "FK_9e7e97761aae25dd1616cb89954" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_command_audit FK_a6512148ba9b672b9ca508372c4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_command_audit
    ADD CONSTRAINT "FK_a6512148ba9b672b9ca508372c4" FOREIGN KEY (str_server_id) REFERENCES public.tbl_servers(id) ON DELETE CASCADE;


--
-- Name: tbl_agent_metrics_history FK_ce016aaff85ad1629793f361fb0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_metrics_history
    ADD CONSTRAINT "FK_ce016aaff85ad1629793f361fb0" FOREIGN KEY (server_id) REFERENCES public.tbl_servers(id) ON DELETE CASCADE;


--
-- Name: tbl_notifications FK_d1a3b5bf8702ee382022b6e8489; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT "FK_d1a3b5bf8702ee382022b6e8489" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_command_audit FK_e82ddc0b2c503d2e5f16ef5c65e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_command_audit
    ADD CONSTRAINT "FK_e82ddc0b2c503d2e5f16ef5c65e" FOREIGN KEY (str_user_id) REFERENCES public.tbl_users(id) ON DELETE CASCADE;


--
-- Name: tbl_notifications FK_ebed54e97ec19937ff3e337008d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT "FK_ebed54e97ec19937ff3e337008d" FOREIGN KEY (str_server_id) REFERENCES public.tbl_servers(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


