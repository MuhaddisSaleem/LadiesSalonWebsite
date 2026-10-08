FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/BarberFlow.Api/BarberFlow.Api.csproj backend/BarberFlow.Api/
RUN dotnet restore backend/BarberFlow.Api/BarberFlow.Api.csproj

COPY backend/BarberFlow.Api/. backend/BarberFlow.Api/
RUN dotnet publish backend/BarberFlow.Api/BarberFlow.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "BarberFlow.Api.dll"]
