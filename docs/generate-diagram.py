from diagrams import Diagram, Cluster, Edge
from diagrams.onprem.client import Users
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.compute import Server
from diagrams.onprem.vcs import Github
from diagrams.programming.framework import React
from diagrams.programming.language import TypeScript
from diagrams.generic.storage import Storage
from diagrams.generic.compute import Rack
from diagrams.saas.analytics import Snowflake
import os

os.chdir("/Users/j/opendiff/docs")

graph_attr = {
    "fontsize": "14",
    "bgcolor": "transparent",
    "pad": "0.5",
    "splines": "spline",
    "nodesep": "0.6",
    "ranksep": "0.8",
    "fontname": "SF Pro Display",
}

with Diagram(
    "",
    show=False,
    filename="architecture",
    outformat=["png"],
    direction="TB",
    graph_attr=graph_attr,
):
    with Cluster("External"):
        github = Github("GitHub")
        opencode = Snowflake("OpenCode")
        db = PostgreSQL("PostgreSQL")

    with Cluster("Backend"):
        bff = Server("opendiff-bff\nAPI")
        agent = Server("opendiff-review-agent\nAI Reviewer")

    with Cluster("Frontend"):
        website = React("opendiff-website")
        app = React("opendiff-app")

    with Cluster("Shared"):
        components = TypeScript("components")
        shared = TypeScript("shared")
        assets = Storage("assets")

    # Shared dependencies
    app >> Edge(style="dashed", color="gray") >> components
    app >> Edge(style="dashed", color="gray") >> shared
    website >> Edge(style="dashed", color="gray") >> components
    website >> Edge(style="dashed", color="gray") >> shared

    # API calls
    app >> Edge(color="darkblue") >> bff
    website >> Edge(color="darkblue") >> bff

    # Backend
    bff >> db
    agent >> bff
    agent >> opencode
    agent >> github

    # Webhooks
    github >> Edge(label="webhooks", style="dashed", color="green") >> agent
